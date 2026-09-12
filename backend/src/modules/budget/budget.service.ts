import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetOverview, BudgetTransaction, KasaAlacakBorc, ProjectBudgetSummary, RecurringPayment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireAmount, requireOneOf, optionalOneOf, paraBirimiDogrula } from "../../common/validation/input";
import { NotificationsService } from "../notifications/notifications.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { ORG_RECEIVABLE_MODULE_KEY, sirketAlacakBorcu } from "./sirket-defteri";
import { mapTransaction, SECIM } from "./butce-eslestirme";
import { ButceErisimService } from "./butce-erisim.service";
import { ButceKademeService } from "./butce-kademe.service";

/**
 * budget_transactions.type için izin verilen değerler. 001_init_schema.sql'deki
 * CHECK kısıtıyla BİREBİR aynı olmalı — biri değişirse diğeri de değişmeli.
 */
const TRANSACTION_TYPES = ["income", "expense", "payout"] as const;
@Injectable()
export class BudgetService {
  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService,
    private erisim: ButceErisimService,
    private kademe: ButceKademeService
  ) {}

  // Proje bütçesi: finansal veri hassas olduğu için görüntüleme yalnızca proje/iş
  // sahibine ve "bütçeyi görebilir" izni açık onaylı üyelere açık (bkz. departman
  // bütçesindeki assertCanManageDepartment ile aynı gerekçe/desen).
  //
  // `private` DEĞİL: projenin düzenli ödemelerini listeleyen uç de aynı kuralı
  // uyguluyor (bkz. BudgetController). Kuralın ikinci bir kopyası çıkmasın.
  async assertCanViewBudget(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    const { data: membership } = await this.supabase.client
      .from("project_members")
      .select("can_view_budget")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("status", "approved")
      .maybeSingle();
    if (membership?.can_view_budget) return;
    throw new ForbiddenException("Bu projenin bütçesini görüntüleme yetkiniz yok");
  }

  // Kayıt ekleme/silme yalnızca proje ya da (varsa) iş sahibine açık.
  private async assertCanManageBudget(projectId: string, userId?: string): Promise<void> {
    if (!userId) return;
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id, job_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id === userId) return;
    if (project.job_id) {
      const { data: job } = await this.supabase.client.from("jobs").select("owner_id").eq("id", project.job_id).maybeSingle();
      if (job?.owner_id === userId) return;
    }
    throw new ForbiddenException("Bu projenin bütçesine kayıt eklemeyi yalnızca proje veya iş sahibi yapabilir");
  }

  async findByProject(projectId: string, requestingUserId?: string): Promise<BudgetTransaction[]> {
    await this.assertCanViewBudget(projectId, requestingUserId);

    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select(SECIM)
      .eq("project_id", projectId)
      .order("occurred_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  async add(projectId: string, data: Partial<BudgetTransaction>, requestingUserId?: string): Promise<BudgetTransaction> {
    await this.assertCanManageBudget(projectId, requestingUserId);

    // Proje bazlı kayıtta defter sahibi, projenin sahibidir.
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: projectId,
        owner_id: project?.owner_id ?? null,
        created_by: requestingUserId ?? null,
        user_id: data.userId ?? null,
        type: requireOneOf(data.type ?? "expense", TRANSACTION_TYPES, "İşlem türü"),
        amount: requireAmount(data.amount ?? 0),
        currency: paraBirimiDogrula(data.currency),
        category: data.category?.trim() || null,
        counterparty_id: data.counterpartyId || null,
        description: data.description ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString().slice(0, 10),
      })
      .select(SECIM)
      .single();
    if (error) throw error;
    const tx = mapTransaction(row);
    if (tx.userId) {
      this.notificationsService.notifyUserSafe(
        tx.userId,
        "budget_changed",
        "Bütçe Güncellendi",
        // Hareketin türü ("income"/"expense") bir enum; cümleye yer tutucu
        // olarak geçilse İngilizce arayüzde de İngilizce görünürdü ama
        // kullanıcıya "income" diye ham bir sözcük göstermek istemiyoruz.
        // Bu yüzden iki ayrı metin.
        tx.type === "income"
          ? { metin: "Gelir: {tutar} ₺", params: { tutar: tx.amount } }
          : { metin: "Gider: {tutar} ₺", params: { tutar: tx.amount } }
      );
    }
    return tx;
  }

  // --- Departman bütçesi (Bütçe sekmesi) ---
  //
  // Kural artık BURADA DEĞİL: dört kurumsal kademe (iş / departman / şirket /
  // holding) tek koddan geçiyor (bkz. ButceKademeService). Bu üç metot yalnızca
  // eski çağıranları (departman bütçe ucu, Yaptım kaydından gider girme)
  // kırmamak için duruyor.
  //
  // Neden birleştirildi: departman bütçesi 029'da tek başına yazılırken 020'nin
  // "defter sahibi" kuralı atlanmış ve kayıtlar aylarca hiçbir deftere ait
  // olmamıştı (bkz. migration 100). Aynı hatanın dört kez tekrarlanmaması için
  // tek kural, tek yer.

  async findByDepartment(departmentId: string, requestingUserId?: string): Promise<BudgetTransaction[]> {
    return this.kademe.hareketler("department", departmentId, requestingUserId);
  }

  async addForDepartment(
    departmentId: string,
    data: Partial<BudgetTransaction>,
    requestingUserId?: string
  ): Promise<BudgetTransaction> {
    return this.kademe.ekle("department", departmentId, data, requestingUserId);
  }

  async removeForDepartment(id: string, requestingUserId?: string): Promise<{ success: true }> {
    return this.removeTransaction(id, requestingUserId);
  }

  // Projeden elde kalan net: tahsil edilen - harcanan.
  // NOT: anlaşılan ücret (totalBudget) buraya EKLENMEZ; tahsil edilen para zaten
  // o ücretin bir parçasıdır, eklemek aynı parayı iki kez saymak olurdu.
  async calculateRemainingMargin(projectId: string, requestingUserId?: string): Promise<number> {
    const txs = await this.findByProject(projectId, requestingUserId);
    return sumByType(txs, "income") - sumSpent(txs);
  }

  // Henüz tahsil edilmemiş alacak. agreedFee istemciden değil her zaman DB'deki
  // güncel proje bütçesinden okunur — istemcide eski/senkron olmayan bir değer
  // (ör. bütçe az önce başka biri tarafından değiştirildiyse) yanlış sonuç üretmesin diye.
  async calculateExpectedPayment(projectId: string, requestingUserId?: string): Promise<number> {
    const [txs, project] = await Promise.all([
      this.findByProject(projectId, requestingUserId),
      this.supabase.client.from("projects").select("total_budget").eq("id", projectId).maybeSingle(),
    ]);
    const agreedFee = Number(project.data?.total_budget ?? 0);
    return Math.max(0, agreedFee - sumByType(txs, "income"));
  }

  // --- Anasayfa bütçe sekmesi (kullanıcının kendi defteri) ---

  // Kullanıcının sahibi olduğu projeler. Bütçe hassas bir veri olduğu için genel
  // defterde yalnızca kendi projeleri toplanır; üyesi olduğu başkasının projesi
  // buraya karışmaz (o proje kendi detay sayfasında ayrıca görülebiliyor).
  private async ownedProjects(userId: string): Promise<{ id: string; title: string; total_budget: number }[]> {
    const { data, error } = await this.supabase.client
      .from("projects")
      .select("id, title, total_budget")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (error) throw error;
    return data ?? [];
  }

  /**
   * Kullanıcının tüm hareketleri — TEK SORGU.
   *
   * Eskiden iki kaynaktan okunuyordu: budget_transactions + şirketin
   * gelir-gider MODÜLÜ (module_records). Modül kaldırıldı ve kayıtları buraya
   * taşındı (migration 104); artık tek tablo var.
   *
   * Şirket/holding/iş kademesine girilen kayıtlar da BURAYA DÜŞER, çünkü
   * hepsinin owner_id'si kademenin sahibidir. Kural bilerek "kurduysan akar,
   * dahil olduysan akmaz": Kasa kişinin kendi defteri — şirketi kuran için
   * şirketin parası kendi parasıdır, başkasının şirketinde departman
   * yöneticisi olan biri için değildir.
   */
  async findAllForUser(userId: string, limit = 200): Promise<BudgetTransaction[]> {
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select(SECIM)
      .eq("owner_id", userId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  /** Kullanıcının KURDUĞU (arşivlenmemiş) şirketler: id -> ad. */
  private async ownedOrganizations(userId: string): Promise<Map<string, string>> {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("id, name")
      .eq("owner_id", userId)
      .is("archived_at", null);
    if (error) throw error;
    return new Map<string, string>((data ?? []).map((o: any) => [o.id, o.name]));
  }

  /**
   * Kasa'nın vade takibine giren şirket alacak/borçları: kullanıcının sahibi
   * olduğu şirketlerin AÇIK kayıtları.
   *
   * Gelir/gider defterinin aksine bunlar gerçekleşen para DEĞİL, bu yüzden
   * hareketlere karışmıyor ve hiçbir toplama girmiyor — ayrı bir uçtan, ayrı
   * bir bölüm olarak veriliyor (bkz. BudgetPanel > "Alacak / borç").
   */
  async findOpenReceivablesForUser(userId: string): Promise<KasaAlacakBorc[]> {
    const adlar = await this.ownedOrganizations(userId);
    if (adlar.size === 0) return [];

    const { data: rows, error } = await this.supabase.client
      .from("module_records")
      .select("id, organization_id, data")
      .in("organization_id", Array.from(adlar.keys()))
      .eq("module_key", ORG_RECEIVABLE_MODULE_KEY)
      .is("archived_at", null)
      .limit(LISTE_TAVANI);
    if (error) throw error;

    // "Kimden / kime" alanı bir referans: kayıtta party id'si durur, ekranda ad
    // gösterilir (eski kayıtlarda ham metin olabilir, bkz. moduleReferences.ts).
    // Adı burada çözüyoruz; istemci tarafında çözmek Kasa'daki her şirket için
    // ayrı bir /party isteği demekti.
    const karsiTaraflar = await this.resolveParties(
      (rows ?? []).map((r: any) => r.data?.counterparty).filter((v: unknown): v is string => typeof v === "string")
    );

    const kayitlar: KasaAlacakBorc[] = [];
    for (const row of rows ?? []) {
      const kayit = sirketAlacakBorcu(
        row,
        adlar.get(row.organization_id),
        karsiTaraflar.get(String(row.data?.counterparty ?? ""))
      );
      if (kayit) kayitlar.push(kayit);
    }
    // Vadesi olmayanlar listenin sonuna: süzgeç onları gecikmiş/yaklaşan saymıyor.
    kayitlar.sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));
    return kayitlar;
  }

  /** Party id'lerini ada çevirir; UUID olmayan (eski, serbest metin) değerler atlanır. */
  private async resolveParties(degerler: string[]): Promise<Map<string, string>> {
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idler = Array.from(new Set(degerler.filter((v) => UUID.test(v))));
    if (idler.length === 0) return new Map();
    const { data, error } = await this.supabase.client.from("party").select("id, display_name").in("id", idler);
    if (error) throw error;
    return new Map<string, string>((data ?? []).map((p: any) => [p.id, p.display_name]));
  }

  async getOverview(userId: string): Promise<BudgetOverview> {
    const [projects, tumHareketler] = await Promise.all([
      this.ownedProjects(userId),
      this.findAllForUser(userId, 1000),
    ]);

    // Kişisel Kasa TEK TOPLAM gösterir ve kur dönüşümü yapmaz; bu yüzden
    // özet YALNIZCA ₺ kayıtlardan hesaplanır. Defter çok para birimli oldu
    // (migration 104) ama "1.000 USD + 1.000 TRY = 2.000 ₺" her zaman yanlış.
    // Döviz kayıtlar listede kendi birimiyle görünmeye devam eder — yalnızca
    // bu özetin dışında kalırlar.
    const transactions = tumHareketler.filter((t) => (t.currency || "TRY") === "TRY");

    // Kırılımda satırı olmayan her kayıt "genel"e düşer. Yalnızca projesiz
    // kayıtlar değil, ARŞİVLENMİŞ bir projeye ait kayıtlar da: ownedProjects
    // arşivlileri getirmiyor ve eskiden bu kayıtlar hiçbir kovaya girmediği için
    // toplamlardan sessizce düşüyordu — defterde duran gider Kasa'daki "Gider"
    // kutusuna yansımıyordu. Departman kayıtlarının da projesi yoktur; onlar da
    // buraya düşer (bkz. addForDepartment: defter sahibi organizasyon sahibi).
    const ownedIds = new Set(projects.map((p) => p.id));
    const byProject = new Map<string, BudgetTransaction[]>();
    const general: BudgetTransaction[] = [];
    for (const tx of transactions) {
      if (!tx.projectId || !ownedIds.has(tx.projectId)) {
        general.push(tx);
        continue;
      }
      const list = byProject.get(tx.projectId) ?? [];
      list.push(tx);
      byProject.set(tx.projectId, list);
    }

    const projectSummaries: ProjectBudgetSummary[] = projects.map((p) => {
      const txs = byProject.get(p.id) ?? [];
      const agreedFee = Number(p.total_budget);
      const received = sumByType(txs, "income");
      const expense = sumSpent(txs);
      return {
        projectId: p.id,
        projectTitle: p.title,
        agreedFee,
        received,
        // Tahsil edilen, anlaşılan ücretin içinden düşer — üstüne eklenmez.
        expected: Math.max(0, agreedFee - received),
        overpaid: Math.max(0, received - agreedFee),
        expense,
        netEarned: received - expense,
        fullyCollected: agreedFee > 0 && received >= agreedFee,
      };
    });

    const generalIncome = sumByType(general, "income");
    const generalExpense = sumSpent(general);

    const totalAgreedFee = projectSummaries.reduce((sum, p) => sum + p.agreedFee, 0);
    const totalReceived = projectSummaries.reduce((sum, p) => sum + p.received, 0) + generalIncome;
    const totalExpected = projectSummaries.reduce((sum, p) => sum + p.expected, 0);
    const totalExpense = projectSummaries.reduce((sum, p) => sum + p.expense, 0) + generalExpense;

    return {
      totalAgreedFee,
      totalReceived,
      totalExpected,
      totalExpense,
      netEarned: totalReceived - totalExpense,
      generalIncome,
      generalExpense,
      // Tahsil edilmeyi bekleyen en büyük alacak en üstte.
      projects: projectSummaries.sort((a, b) => b.expected - a.expected || b.agreedFee - a.agreedFee),
    };
  }

  // Anasayfadan eklenen kayıt: proje seçimi opsiyonel.
  async createForUser(userId: string, data: Partial<BudgetTransaction>): Promise<BudgetTransaction> {
    if (data.projectId) await this.assertOwnsProject(data.projectId, userId);

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        project_id: data.projectId ?? null,
        owner_id: userId,
        created_by: userId,
        user_id: data.userId ?? null,
        type: requireOneOf(data.type ?? "expense", TRANSACTION_TYPES, "İşlem türü"),
        amount: requireAmount(data.amount ?? 0),
        currency: paraBirimiDogrula(data.currency),
        category: data.category?.trim() || null,
        counterparty_id: data.counterpartyId || null,
        description: data.description ?? null,
        occurred_at: data.occurredAt ?? new Date().toISOString().slice(0, 10),
      })
      .select(SECIM)
      .single();
    if (error) throw error;
    return mapTransaction(row);
  }

  // Cron tarafından çağrılır: vadesi gelen düzenli ödemeyi deftere işler.
  async createRecurringTransaction(payment: RecurringPayment, occurredAt: string): Promise<BudgetTransaction> {
    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        // Düzenli ödeme hangi kademeye bağlıysa üreteceği hareket de oraya
        // düşer: şirketin kirası şirket defterine, projenin hakedişi projeye.
        project_id: payment.projectId ?? null,
        department_id: payment.departmentId ?? null,
        job_id: payment.jobId ?? null,
        organization_id: payment.organizationId ?? null,
        group_id: payment.groupId ?? null,
        owner_id: payment.ownerId,
        type: payment.type,
        amount: payment.amount,
        currency: payment.currency || "TRY",
        category: payment.category ?? null,
        description: payment.description ?? null,
        occurred_at: occurredAt,
        recurring_payment_id: payment.id,
      })
      .select(SECIM)
      .single();
    if (error) throw error;
    return mapTransaction(row);
  }

  // --- Tek kayıt üzerinde düzenleme/silme (defterin hangisi olduğundan bağımsız) ---
  //
  // Bir bütçe kaydı üç yerden birine ait olabilir: bir projeye, bir departmana ya
  // da doğrudan kullanıcının kendi defterine. Yetki kuralı üçünde de zaten
  // tanımlıydı ama yalnızca EKLEME ve SİLME yollarında kullanılıyordu; kaydı
  // düzenlemenin hiçbir yolu yoktu (yanlış tutar giren kullanıcı silip yeniden
  // yazmak zorundaydı). Buradaki tek kapı, kaydın bağlamına bakıp doğru kuralı
  // uyguluyor; böylece proje, departman ve kişisel defter aynı uçtan yönetiliyor.
  private async assertCanManageTransaction(id: string, userId?: string): Promise<any> {
    const { data: row } = await this.supabase.client
      .from("budget_transactions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    if (row.project_id) {
      await this.assertCanManageBudget(row.project_id, userId);
      return row;
    }
    // Kurumsal kademeler (iş / departman / şirket / holding) tek kapıdan:
    // sahip + yönetici + yöneticinin görünürlük verdiği kullanıcılar.
    if (row.department_id) {
      await this.erisim.assertCanManage("department", row.department_id, userId);
      return row;
    }
    if (row.job_id) {
      await this.erisim.assertCanManage("job", row.job_id, userId);
      return row;
    }
    if (row.organization_id) {
      await this.erisim.assertCanManage("organization", row.organization_id, userId);
      return row;
    }
    if (row.group_id) {
      await this.erisim.assertCanManage("group", row.group_id, userId);
      return row;
    }
    if (userId && row.owner_id !== userId) throw new ForbiddenException("Bu kaydı düzenleme yetkin yok");
    return row;
  }

  async updateTransaction(
    id: string,
    data: Partial<BudgetTransaction>,
    userId?: string
  ): Promise<BudgetTransaction> {
    await this.assertCanManageTransaction(id, userId);

    const patch: Record<string, unknown> = {};
    if (data.type !== undefined) patch.type = optionalOneOf(data.type, TRANSACTION_TYPES, "İşlem türü");
    if (data.amount !== undefined) patch.amount = requireAmount(data.amount);
    // Boş açıklama "temizle" demektir; undefined ise alan hiç gönderilmemiştir.
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.currency !== undefined) patch.currency = paraBirimiDogrula(data.currency);
    if (data.category !== undefined) patch.category = data.category?.trim() || null;
    if (data.counterpartyId !== undefined) patch.counterparty_id = data.counterpartyId || null;
    if (data.occurredAt !== undefined) patch.occurred_at = data.occurredAt.slice(0, 10);
    // Kaydı başka bir projeye taşımak: hedef projenin de kullanıcıya ait olması şart.
    if (data.projectId !== undefined) {
      if (data.projectId && userId) await this.assertOwnsProject(data.projectId, userId);
      patch.project_id = data.projectId || null;
    }

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .update(patch)
      .eq("id", id)
      .select(SECIM)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapTransaction(row);
  }

  async removeTransaction(id: string, userId?: string): Promise<{ success: true }> {
    await this.assertCanManageTransaction(id, userId);
    const { error } = await this.supabase.client.from("budget_transactions").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  async removeForUser(id: string, userId: string): Promise<{ success: true }> {
    const { data: row } = await this.supabase.client
      .from("budget_transactions")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    if (row.owner_id !== userId) throw new ForbiddenException("Bu kaydı silme yetkin yok");

    const { error } = await this.supabase.client.from("budget_transactions").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  private async assertOwnsProject(projectId: string, userId: string): Promise<void> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id !== userId) throw new ForbiddenException("Bu projeye kayıt ekleyemezsin");
  }
}

function sumByType(txs: BudgetTransaction[], type: BudgetTransaction["type"]): number {
  return txs.filter((t) => t.type === type).reduce((sum, t) => sum + t.amount, 0);
}

// Gider + hakediş/ödeme birlikte "harcanan" sayılır.
function sumSpent(txs: BudgetTransaction[]): number {
  return txs.filter((t) => t.type === "expense" || t.type === "payout").reduce((sum, t) => sum + t.amount, 0);
}
