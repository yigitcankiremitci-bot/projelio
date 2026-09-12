import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetViewer, ButceYetkisi } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { AccessService } from "../../common/access/access.service";
import { butceYetkisiKarari, viewerKapsamiMi, type ViewerKapsami } from "./butce-erisim";

/**
 * Gömülü kullanıcı alanı — FK ADI AÇIKÇA yazılıyor.
 *
 * NEDEN: budget_viewers tablosunun `users`'a İKİ yabancı anahtarı var
 * (`user_id` = listeye eklenen kişi, `created_by` = ekleyen kişi). Sade
 * `users(...)` yazıldığında PostgREST hangisini kastettiğimizi bilemiyor ve
 * isteği PGRST201 ile reddediyor — uç 500 dönüyordu. Tipler ve testler bunu
 * yakalamaz; hata yalnızca gerçek veritabanına çıkınca görünür.
 *
 * İstediğimiz her zaman `user_id`: liste "bu bütçeyi kimler görüyor" sorusunun
 * cevabı, "kim ekledi"nin değil.
 */
const VIEWER_KULLANICI = "users!budget_viewers_user_id_fkey(full_name, email)";

/**
 * Bütçe kademelerinin yetki kapısı.
 *
 * Burada yalnızca GERÇEKLER toplanır; karar butce-erisim.ts'teki saf
 * fonksiyonda verilir (bkz. oradaki açıklama). İki dosyaya bölünmesinin sebebi
 * kuralın veritabanı olmadan testlenebilmesi.
 *
 * Proje ve rutin kademesi BURADA DEĞİL: onların kuralı BudgetService içinde
 * zaten vardı (project_members.can_view_budget) ve çalışıyor. İkinci bir kopya
 * çıkarmak, iki kuralın bir gün ayrışması demekti.
 */
@Injectable()
export class ButceErisimService {
  constructor(
    private supabase: SupabaseService,
    private access: AccessService
  ) {}

  /** Kademenin görünen adı — ekranda ve hata mesajlarında kullanılır. */
  async kademeAdi(scopeType: ViewerKapsami, scopeId: string): Promise<string> {
    const tablo = { job: "jobs", department: "departments", organization: "organizations", group: "groups" }[scopeType];
    const alan = scopeType === "job" ? "title" : "name";
    const { data } = await this.supabase.client.from(tablo).select(alan).eq("id", scopeId).maybeSingle();
    if (!data) throw new NotFoundException("Bütçe kademesi bulunamadı");
    return (data as any)[alan] as string;
  }

  /**
   * İsteyen kullanıcının bu kademedeki bütçe yetkisi.
   *
   * userId boşsa (sunucu içi çağrı, cron) tam yetki döner — aynı desen
   * projedeki assertCanViewBudget'ta da var: kimliksiz çağrı yapan taraf zaten
   * sistemin kendisidir.
   */
  async yetki(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<ButceYetkisi> {
    if (!userId) return { canView: true, canManage: true, canApprove: true, canManageViewers: true };

    const [gercekler, viewer] = await Promise.all([
      this.sahiplikGercekleri(scopeType, scopeId, userId),
      this.viewerKaydi(scopeType, scopeId, userId),
    ]);

    return butceYetkisiKarari({
      scopeType,
      isOwner: gercekler.isOwner,
      isManager: gercekler.isManager,
      isExplicitViewer: !!viewer,
      explicitCanManage: !!viewer?.can_manage,
      isSubcontractor: await this.access.isSubcontractor(userId),
    });
  }

  /**
   * Kademenin sahibi/yöneticisi kim.
   *
   * ÜST KADEME AŞAĞIYI YÖNETİR: holding sahibi altındaki şirketin, şirket
   * sahibi altındaki departmanın ve işin bütçesini yönetir. Bu zincir olmasaydı
   * holding sahibi kendi kurduğu şirketin defterine bakamazdı — hiyerarşinin
   * tüm anlamı zaten yukarıda toplanması.
   */
  private async sahiplikGercekleri(
    scopeType: ViewerKapsami,
    scopeId: string,
    userId: string
  ): Promise<{ isOwner: boolean; isManager: boolean }> {
    if (scopeType === "group") {
      const { data: group } = await this.supabase.client.from("groups").select("owner_id").eq("id", scopeId).maybeSingle();
      if (!group) throw new NotFoundException("Holding bulunamadı");
      return { isOwner: group.owner_id === userId, isManager: false };
    }

    if (scopeType === "organization") {
      const { data: org } = await this.supabase.client
        .from("organizations")
        .select("owner_id, group_id")
        .eq("id", scopeId)
        .maybeSingle();
      if (!org) throw new NotFoundException("Organizasyon bulunamadı");
      if (org.owner_id === userId) return { isOwner: true, isManager: false };
      return { isOwner: false, isManager: await this.grupSahibiMi(org.group_id, userId) };
    }

    if (scopeType === "job") {
      const { data: job } = await this.supabase.client
        .from("jobs")
        .select("owner_id, organization_id, group_id")
        .eq("id", scopeId)
        .maybeSingle();
      if (!job) throw new NotFoundException("İş bulunamadı");
      if (job.owner_id === userId) return { isOwner: true, isManager: false };
      const ustKademe =
        (await this.organizasyonSahibiMi(job.organization_id, userId)) || (await this.grupSahibiMi(job.group_id, userId));
      return { isOwner: false, isManager: ustKademe };
    }

    // department
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", scopeId)
      .maybeSingle();
    if (!dept) throw new NotFoundException("Departman bulunamadı");
    if (await this.organizasyonSahibiMi(dept.organization_id, userId)) return { isOwner: true, isManager: false };

    const { data: managerRow } = await this.supabase.client
      .from("department_members")
      .select("id")
      .eq("department_id", scopeId)
      .eq("user_id", userId)
      .eq("role", "manager")
      .eq("status", "approved")
      .maybeSingle();
    if (managerRow) return { isOwner: false, isManager: true };

    // Departmanın şirketi bir holdinge bağlıysa holding sahibi de yönetir.
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("group_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    return { isOwner: false, isManager: await this.grupSahibiMi(org?.group_id, userId) };
  }

  private async organizasyonSahibiMi(organizationId: string | null | undefined, userId: string): Promise<boolean> {
    if (!organizationId) return false;
    const { data } = await this.supabase.client.from("organizations").select("owner_id").eq("id", organizationId).maybeSingle();
    return data?.owner_id === userId;
  }

  private async grupSahibiMi(groupId: string | null | undefined, userId: string): Promise<boolean> {
    if (!groupId) return false;
    const { data } = await this.supabase.client.from("groups").select("owner_id").eq("id", groupId).maybeSingle();
    return data?.owner_id === userId;
  }

  private async viewerKaydi(scopeType: ViewerKapsami, scopeId: string, userId: string) {
    const { data } = await this.supabase.client
      .from("budget_viewers")
      .select("can_manage")
      .eq("scope_type", scopeType)
      .eq("scope_id", scopeId)
      .eq("user_id", userId)
      .maybeSingle();
    return data;
  }

  // ------------------------------------------------------------- Kapılar

  async assertCanView(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<ButceYetkisi> {
    const yetki = await this.yetki(scopeType, scopeId, userId);
    if (!yetki.canView) throw new ForbiddenException("Bu bütçeyi görüntüleme yetkiniz yok");
    return yetki;
  }

  async assertCanManage(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<ButceYetkisi> {
    const yetki = await this.yetki(scopeType, scopeId, userId);
    if (!yetki.canManage) throw new ForbiddenException("Bu bütçeye kayıt ekleme yetkiniz yok");
    return yetki;
  }

  async assertCanManageViewers(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<void> {
    const yetki = await this.yetki(scopeType, scopeId, userId);
    if (!yetki.canManageViewers) {
      throw new ForbiddenException("Bütçeyi kimlerin göreceğine yalnızca sahibi veya yöneticisi karar verebilir");
    }
  }

  // -------------------------------------------- Görünürlük listesi (viewers)

  async viewers(scopeType: string, scopeId: string, userId?: string): Promise<BudgetViewer[]> {
    const kapsam = this.kapsamDogrula(scopeType);
    await this.assertCanManageViewers(kapsam, scopeId, userId);

    const { data, error } = await this.supabase.client
      .from("budget_viewers")
      .select(`*, ${VIEWER_KULLANICI}`)
      .eq("scope_type", kapsam)
      .eq("scope_id", scopeId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapViewer);
  }

  /**
   * Listeye kullanıcı ekler ya da mevcut kaydın yazma iznini günceller.
   *
   * Aynı kişiyi iki kez eklemek hata DEĞİL: yönetici "bu kişi görsün" demek
   * istiyor, kayıt zaten varsa istediği zaten olmuş demektir. Veritabanındaki
   * tekil indeks de bunu garanti ediyor.
   */
  async addViewer(
    scopeType: string,
    scopeId: string,
    hedefUserId: string,
    canManage: boolean,
    userId?: string
  ): Promise<BudgetViewer> {
    const kapsam = this.kapsamDogrula(scopeType);
    await this.assertCanManageViewers(kapsam, scopeId, userId);

    // Taşerona görünürlük verilemez: verilse bile butceYetkisiKarari onu
    // reddeder ve listede "görüyor" sanılan ama görmeyen bir satır kalırdı.
    if (await this.access.isSubcontractor(hedefUserId)) {
      throw new ForbiddenException("Taşerona bütçe görünürlüğü verilemez");
    }

    const { data, error } = await this.supabase.client
      .from("budget_viewers")
      .upsert(
        {
          scope_type: kapsam,
          scope_id: scopeId,
          user_id: hedefUserId,
          can_manage: canManage,
          created_by: userId ?? null,
        },
        { onConflict: "scope_type,scope_id,user_id" }
      )
      .select(`*, ${VIEWER_KULLANICI}`)
      .single();
    if (error) throw error;
    return mapViewer(data);
  }

  async removeViewer(scopeType: string, scopeId: string, hedefUserId: string, userId?: string): Promise<{ success: true }> {
    const kapsam = this.kapsamDogrula(scopeType);
    await this.assertCanManageViewers(kapsam, scopeId, userId);
    const { error } = await this.supabase.client
      .from("budget_viewers")
      .delete()
      .eq("scope_type", kapsam)
      .eq("scope_id", scopeId)
      .eq("user_id", hedefUserId);
    if (error) throw error;
    return { success: true };
  }

  kapsamDogrula(scopeType: string): ViewerKapsami {
    if (!viewerKapsamiMi(scopeType)) {
      throw new NotFoundException("Tanınmayan bütçe kademesi");
    }
    return scopeType;
  }
}

function mapViewer(row: any): BudgetViewer {
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    userId: row.user_id,
    userName: row.users?.full_name ?? undefined,
    userEmail: row.users?.email ?? undefined,
    canManage: !!row.can_manage,
    createdAt: row.created_at,
  };
}
