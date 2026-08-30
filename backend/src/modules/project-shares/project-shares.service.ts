import { randomBytes } from "crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type {
  CreateProjectShareLinkInput,
  ProjectShareLink,
  ProjectShareVisibility,
  ProjectStatus,
  PublicProjectAccess,
  PublicProjectView,
} from "@projelio/shared";
import {
  isLikelyEmail,
  normalizeShareEmail,
  normalizeShareVisibility,
  shareEmailMatches,
  shareLinkClosedReason,
  taskProgress,
} from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { ProjectsService } from "../projects/projects.service";
import { getWebAppUrl } from "../../common/config/env";
import { mapPublicTasks } from "./public-view";

/**
 * Üyelik gerektirmeyen proje takip linkleri.
 *
 * NE YAPIYOR: proje sahibi bir link üretir ve projeyle ilgili ama Projelio'da
 * hesabı olmayan kişilere (müşteri, yatırımcı, danışman) gönderir. Linki açan
 * kişi yalnızca sahibinin AÇIKÇA seçtiği bölümleri, salt okunur görür.
 *
 * GÜVENLİK — bu dosyanın tek gerçek işi bu:
 *
 * 1. Token tek koruma katmanı. 24 baytlık rastgele (192 bit) base64url dizi;
 *    tahmin edilemez. Loglara, hata mesajlarına, bildirimlere yazılmaz.
 * 2. Görünürlük VARSAYILAN KAPALI ve her okumada yeniden normalize edilir
 *    (bkz. normalizeShareVisibility). Veritabanına bir şekilde eksik satır
 *    düşerse bile kapalı tarafa düşer.
 * 3. Sorgular DAR: her bölüm için yalnızca gösterilecek sütunlar seçilir.
 *    `select()` ile tüm satırı çekip sonra alan ayıklamak, ileride tabloya
 *    eklenen bir sütunun (ör. taşeron ücreti) sessizce dışarı sızması demekti.
 *    Bu yüzden ORTAK SERVİSLER KULLANILMIYOR: TasksService/MembersService
 *    kullanıcıya göre yetki uyguluyor ve tam nesneler döndürüyor; buradaki
 *    okuyucunun kimliği yok, dolayısıyla ne göndereceğimize burada karar
 *    veriyoruz.
 * 4. Kişisel veri budanır: e-posta, kullanıcı adı, ücret, atanan kişi kimlikleri
 *    ve dosya indirme bağlantıları HİÇBİR koşulda gitmez.
 */
@Injectable()
export class ProjectSharesService {
  private readonly logger = new Logger(ProjectSharesService.name);

  constructor(
    private supabase: SupabaseService,
    private projects: ProjectsService
  ) {}

  // ==================================================================== Yönetim

  async list(projectId: string, userId: string): Promise<ProjectShareLink[]> {
    await this.projects.assertCanManageProject(projectId, userId);
    // Proje durumu linkin açık olup olmadığını belirliyor (tamamlanan proje
    // linki kapatır), o yüzden listeyle birlikte bir kez okunuyor — satır
    // başına sorgu atmak yerine.
    const projectStatus = await this.projectStatus(projectId);
    const { data, error } = await this.supabase.client
      .from("project_share_links")
      .select()
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => this.mapLink(row, projectStatus));
  }

  /** Linkin kapanıp kapanmadığını belirleyen tek dış girdi. */
  private async projectStatus(projectId: string): Promise<ProjectStatus | undefined> {
    const { data } = await this.supabase.client
      .from("projects")
      .select("status")
      .eq("id", projectId)
      .maybeSingle();
    return (data?.status as ProjectStatus) ?? undefined;
  }

  async create(projectId: string, userId: string, input: CreateProjectShareLinkInput): Promise<ProjectShareLink> {
    await this.projects.assertCanManageProject(projectId, userId);

    const { data, error } = await this.supabase.client
      .from("project_share_links")
      .insert({
        project_id: projectId,
        token: newShareToken(),
        label: cleanLabel(input?.label),
        ...visibilityColumns(normalizeShareVisibility(input?.visibility)),
        recipient_email: cleanRecipientEmail(input?.recipientEmail),
        expires_at: expiryFromDays(input?.expiresInDays),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return this.mapLink(data, await this.projectStatus(projectId));
  }

  /**
   * Var olan linkin görünürlüğünü/etiketini/süresini değiştirir.
   *
   * Token DEĞİŞMEZ: sahibi "bütçeyi de göster" dediğinde daha önce gönderdiği
   * link çalışmaya devam etmeli. Linki gerçekten kapatmak isteyen revoke eder.
   */
  async update(
    id: string,
    userId: string,
    input: {
      label?: string;
      visibility?: ProjectShareVisibility;
      expiresInDays?: number | null;
      recipientEmail?: string | null;
    }
  ): Promise<ProjectShareLink> {
    const existing = await this.requireManageableLink(id, userId);

    const patch: Record<string, unknown> = {};
    if (input.label !== undefined) patch.label = cleanLabel(input.label);
    // null = "kapıyı kaldır", undefined = "dokunma". Kapıyı kaldırmak linki
    // herkese açar; bu yüzden açıkça null göndermek gerekiyor.
    if (input.recipientEmail !== undefined) {
      patch.recipient_email = input.recipientEmail === null ? null : cleanRecipientEmail(input.recipientEmail);
    }
    if (input.visibility !== undefined) {
      Object.assign(patch, visibilityColumns(normalizeShareVisibility(input.visibility)));
    }
    // null = "süre sınırını kaldır", undefined = "dokunma".
    if (input.expiresInDays !== undefined) {
      patch.expires_at = input.expiresInDays === null ? null : expiryFromDays(input.expiresInDays);
    }
    if (Object.keys(patch).length === 0) {
      return this.mapLink(existing, await this.projectStatus(existing.project_id));
    }

    const { data, error } = await this.supabase.client
      .from("project_share_links")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapLink(data, await this.projectStatus(data.project_id));
  }

  /**
   * Linki kapatır. Satır SİLİNMEZ: "bu linki kime vermiştim, ne zaman
   * kapattım" sorusu iptalden sonra da cevaplanabilsin.
   */
  async revoke(id: string, userId: string): Promise<ProjectShareLink> {
    await this.requireManageableLink(id, userId);
    const { data, error } = await this.supabase.client
      .from("project_share_links")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return this.mapLink(data, await this.projectStatus(data.project_id));
  }

  private async requireManageableLink(id: string, userId: string): Promise<any> {
    const { data, error } = await this.supabase.client
      .from("project_share_links")
      .select()
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Paylaşım linki bulunamadı");
    await this.projects.assertCanManageProject(data.project_id, userId);
    return data;
  }

  // ==================================================== Linki açan kişi (public)

  /**
   * Token'ı görünüme çevirir.
   *
   * HER OLUMSUZ DURUM AYNI YANIT: token yok, iptal edilmiş, süresi dolmuş,
   * projesi tamamlanmış, proje arşivlenmiş — hepsi `state: "closed"` döner ve
   * SEBEP TAŞIMAZ. Farklı yanıtlar, elinde token olan birine "bu link BİR
   * ZAMANLAR vardı" bilgisini sızdırırdı; sebep yalnızca sahibin listesinde
   * görünür (bkz. mapLink).
   *
   * 404 YERİNE 200 dönüyoruz çünkü kapalı link artık bir hata sayfası değil,
   * Projelio'yu tanıtan bir sayfa gösteriyor (bkz. pages/PublicProject.tsx).
   * Tanınmayan token da aynı sayfayı görür — ayırt edilemezlik böyle korunuyor.
   *
   * E-POSTA KAPISI: linkte adres varsa görünüm ancak doğru adres girildikten
   * sonra kurulur. `email === undefined` "henüz denemedi" demektir; boş dize
   * ise bir denemedir ve reddedilir — kapı boş alan gönderilerek atlanamasın.
   */
  async resolve(token: string, email?: string): Promise<PublicProjectAccess> {
    const closed: PublicProjectAccess = { state: "closed" };
    if (!token || token.length < 16 || token.length > 64) return closed;

    const { data: link, error } = await this.supabase.client
      .from("project_share_links")
      .select()
      .eq("token", token)
      .maybeSingle();
    if (error) throw error;
    if (!link) return closed;

    const { data: project, error: projectError } = await this.supabase.client
      .from("projects")
      .select("id, title, description, status, start_date, deadline, cover_image_url, total_budget, archived_at, owner_id")
      .eq("id", link.project_id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.archived_at) return closed;

    const reason = shareLinkClosedReason({
      revokedAt: link.revoked_at,
      expiresAt: link.expires_at,
      projectStatus: project.status,
    });
    if (reason) return closed;

    if (link.recipient_email) {
      if (email === undefined) return { state: "email_required" };
      if (!shareEmailMatches(link.recipient_email, email)) {
        return { state: "email_required", emailRejected: true };
      }
    }

    const view = await this.buildView(project, linkVisibility(link));

    // Sayaç kapının ARDINDAN artıyor: yanlış adres deneyen biri sahibin
    // "linke bakan oldu mu" sorusunu kirletmesin.
    void this.countView(link);
    return { state: "open", view };
  }

  /** Ziyaret sayacı. Sahibin "linke bakan oldu mu" sorusu için; kim baktığı TUTULMAZ. */
  private async countView(link: any): Promise<void> {
    try {
      await this.supabase.client
        .from("project_share_links")
        .update({
          // Okuma-yazma arasında yarış olabilir ve sayı bir eksik kalabilir;
          // bu bir sayaç, muhasebe kaydı değil — tam olması gerekmiyor.
          view_count: Number(link.view_count ?? 0) + 1,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", link.id);
    } catch (err: any) {
      // Sayaç yazılamadıysa sayfa yine de açılmalı.
      this.logger.warn(`Paylaşım ziyareti sayılamadı: ${err?.message}`);
    }
  }

  private async buildView(project: any, visibility: ProjectShareVisibility): Promise<PublicProjectView> {
    // Görevler iki işe birden yarıyor: hem liste, hem ilerleme yüzdesi. Yüzde
    // özetin parçası ve özet her linkte var — bu yüzden "Görevler" kapalı olsa
    // bile sayım yapılır, yalnızca LİSTE gizlenir.
    const tasks = await this.fetchTasks(project.id);
    const progress = taskProgress(tasks);

    const view: PublicProjectView = {
      title: project.title,
      description: project.description ?? undefined,
      status: project.status,
      startDate: project.start_date,
      deadline: project.deadline,
      coverImageUrl: project.cover_image_url ?? undefined,
      progressPercent: progress.percent,
      taskCounts: {
        total: progress.total,
        completed: progress.completed,
        inProgress: progress.inProgress,
        todo: progress.todo,
      },
      ownerName: await this.fetchOwnerName(project.owner_id),
      updatedAt: new Date().toISOString(),
    };

    // Alan ayıklama ve atanan adı kuralı saf bir fonksiyonda (bkz. public-view.ts):
    // sızıntıya en açık yer orası ve orada test edilebiliyor.
    if (visibility.tasks) view.tasks = mapPublicTasks(tasks, visibility);

    if (visibility.outputs) view.outputs = await this.fetchOutputs(project.id);
    if (visibility.team) view.team = await this.fetchTeam(project.id, project.owner_id);
    if (visibility.feed) view.feed = await this.fetchFeed(project.id);
    if (visibility.files) view.files = await this.fetchFiles(project.id);
    if (visibility.budget) view.budget = await this.fetchBudget(project.id, project.total_budget);

    return view;
  }

  private async fetchOwnerName(ownerId?: string): Promise<string | undefined> {
    if (!ownerId) return undefined;
    const { data } = await this.supabase.client.from("users").select("full_name").eq("id", ownerId).maybeSingle();
    return data?.full_name ?? undefined;
  }

  /**
   * Projenin görevleri. Alt görevler de dahil ve liste DÜZ: yüzde ile listenin
   * aynı kümeden çıkması gerekiyor — biri alt görevleri sayıp diğeri
   * göstermeseydi, takip eden kişi "10 görevin 6'sı bitmiş" yazısının altında
   * 4 satır görürdü.
   */
  private async fetchTasks(projectId: string): Promise<any[]> {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, title, status, start_date, deadline, completed_at, output_id, assigned_user:users!tasks_assigned_to_fkey(full_name)")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("deadline", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  private async fetchOutputs(projectId: string) {
    const { data, error } = await this.supabase.client
      .from("outputs")
      .select("id, title, description")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((o: any) => ({
      id: o.id,
      title: o.title,
      description: o.description ?? undefined,
    }));
  }

  /**
   * Ekip: yalnızca AD ve UNVAN.
   *
   * E-posta, kullanıcı adı, anlaşılan ücret (custom_agreed_rate) ve kullanıcı
   * kimliği bilerek dışarıda. Onaylanmamış (bekleyen davet) üyeler de yok:
   * henüz kabul etmemiş birini "projede çalışıyor" diye göstermek yanlış olurdu.
   */
  private async fetchTeam(projectId: string, ownerId?: string) {
    const { data, error } = await this.supabase.client
      .from("project_members")
      .select("title, status, users(full_name)")
      .eq("project_id", projectId)
      .eq("status", "approved");
    if (error) throw error;

    const members: { fullName: string; title?: string }[] = [];
    for (const m of (data ?? []) as any[]) {
      const fullName = m.users?.full_name as string | undefined;
      // Adı olmayan üye gösterilmez: linki açan kişiye boş bir satır ya da
      // "undefined" göstermektense hiç göstermemek doğru.
      if (fullName) members.push({ fullName, title: m.title ?? undefined });
    }

    // Proje sahibi ekip tablosunda durmuyor ama projede çalışan ilk kişi o.
    const ownerName = await this.fetchOwnerName(ownerId);
    if (ownerName && !members.some((m) => m.fullName === ownerName)) {
      members.unshift({ fullName: ownerName, title: "Proje sorumlusu" });
    }
    return members;
  }

  /** Akış: yalnızca metin, yazar adı ve tarih. Beğeni/yorum sayıları dışarıda. */
  private async fetchFeed(projectId: string) {
    const { data, error } = await this.supabase.client
      .from("project_posts")
      .select("id, body, created_at, users(full_name)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      id: p.id,
      authorName: p.users?.full_name ?? "Ekip",
      body: p.body,
      createdAt: p.created_at,
    }));
  }

  /**
   * Dosyalar: YALNIZCA AD.
   *
   * İndirme bağlantısı (web_view_link, drive_file_id) bilerek yok. Dosyanın
   * kendisini paylaşmak, "projeyi takip etsin" diye verilen bir linkin işi
   * değil; Drive/OneDrive içeriğini kimliksiz bir ziyaretçiye açmak apayrı bir
   * karar ve apayrı bir risk.
   */
  private async fetchFiles(projectId: string) {
    const { data, error } = await this.supabase.client
      .from("files")
      .select("id, name, created_at")
      .eq("project_id", projectId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []).map((f: any) => ({ id: f.id, name: f.name, createdAt: f.created_at ?? undefined }));
  }

  /**
   * Bütçe: yalnızca iki sayı — anlaşılan toplam ve harcanan.
   *
   * Tek tek hareketler (kime ne ödendi, hangi tarihte) gitmiyor: takip eden
   * kişinin sorusu "bütçe nerede", "kime ne ödendi" değil. "Harcanan"ın tanımı
   * BudgetService.sumSpent ile aynı: gider + hakediş.
   */
  private async fetchBudget(projectId: string, totalBudget: unknown) {
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select("type, amount")
      .eq("project_id", projectId);
    if (error) throw error;
    const spent = (data ?? [])
      .filter((t: any) => t.type === "expense" || t.type === "payout")
      .reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0);
    return { total: Number(totalBudget ?? 0), spent };
  }

  // ==================================================================== Eşleme

  /**
   * Sahibin gördüğü hâl. Linki AÇAN kişinin yanıtından farkı bilinçli:
   * burada e-posta kapısının adresi ve linkin neden kapandığı da var — ikisi
   * de public yanıta hiçbir koşulda girmez.
   */
  private mapLink(row: any, projectStatus?: ProjectStatus): ProjectShareLink {
    const closedReason = shareLinkClosedReason({
      revokedAt: row.revoked_at,
      expiresAt: row.expires_at,
      projectStatus,
    });
    return {
      id: row.id,
      projectId: row.project_id,
      token: row.token,
      url: `${getWebAppUrl()}/takip/${row.token}`,
      label: row.label ?? undefined,
      visibility: linkVisibility(row),
      recipientEmail: row.recipient_email ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
      viewCount: Number(row.view_count ?? 0),
      lastViewedAt: row.last_viewed_at ?? undefined,
      createdAt: row.created_at,
      active: closedReason === null,
      closedReason: closedReason ?? undefined,
    };
  }
}

/** Satırdaki show_* sütunlarını görünürlük nesnesine çevirir (varsayılan kapalı). */
function linkVisibility(row: any): ProjectShareVisibility {
  return normalizeShareVisibility({
    tasks: row.show_tasks === true,
    outputs: row.show_outputs === true,
    team: row.show_team === true,
    feed: row.show_feed === true,
    files: row.show_files === true,
    budget: row.show_budget === true,
  });
}

function visibilityColumns(v: ProjectShareVisibility): Record<string, boolean> {
  return {
    show_tasks: v.tasks,
    show_outputs: v.outputs,
    show_team: v.team,
    show_feed: v.feed,
    show_files: v.files,
    show_budget: v.budget,
  };
}

/**
 * 24 bayt = 192 bit rastgelelik, base64url ile 32 karakter.
 *
 * UUID kullanılmadı: v4 UUID'in 122 biti rastgele ve biçimi tanıdık olduğu için
 * "bu bir kimlik, belki tahmin edilebilir" izlenimi veriyor. Burada dizinin tek
 * işi tahmin edilemez olmak.
 */
function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Kapının adresini saklamaya hazırlar.
 *
 * Küçük harfe indiriliyor çünkü karşılaştırma da öyle yapılıyor; veritabanında
 * "Ahmet@X.com", karşılaştırmada "ahmet@x.com" durursa sahibi ne kaydettiğini
 * göremez. Bariz hatalı adres reddediliyor: yanlış yazılmış bir adres kapıyı
 * kimsenin açamayacağı hâle getirir ve sahibi bunu ancak alıcı şikâyet edince
 * öğrenirdi.
 */
function cleanRecipientEmail(email?: string): string | null {
  const normalized = normalizeShareEmail(email);
  if (!normalized) return null;
  if (!isLikelyEmail(normalized)) {
    throw new BadRequestException("Geçerli bir e-posta adresi girin");
  }
  return normalized;
}

function cleanLabel(label?: string): string | null {
  const trimmed = label?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 120);
}

/** Gün sayısını bitiş anına çevirir. 0/negatif/saçma değerler reddedilir. */
function expiryFromDays(days?: number): string | null {
  if (days === undefined || days === null) return null;
  if (!Number.isFinite(days) || days <= 0 || days > 3650) {
    throw new BadRequestException("Geçerli bir süre girin (1-3650 gün)");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}
