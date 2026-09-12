import { Injectable } from "@nestjs/common";
import type {
  BudgetScopeType,
  BudgetTransaction,
  ButceKademeOzeti,
  ButceSayfasi,
  GorevButceTalebi,
  RecurringPayment,
} from "@projelio/shared";
import { donemNoktalari, paraBirimiBazinda, tTablolari, toplamlariTopla } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { ButceErisimService } from "./butce-erisim.service";
import type { ViewerKapsami } from "./butce-erisim";
import { mapTransaction, mapRecurringPayment, SECIM } from "./butce-eslestirme";

/**
 * Kademeler arası bütçe toplaması.
 *
 * ÇALIŞMA BİÇİMİ: her kademe kendi defterine yalnızca KENDİ hareketlerini
 * yazar; bir üst kademe alttakileri TOPLAR, kopyalamaz. Veritabanındaki
 * budget_tx_single_parent kısıtı bir satırın iki kademeye birden ait olmasını
 * imkânsız kılıyor — bu yüzden toplama sırasında aynı tutar iki kez sayılamaz.
 * Bu ürünün güvenilirliği tam olarak bu tek cümleye dayanıyor
 * (bkz. docs/moduller/02-karar-notu-butce-vs-muhasebe.md).
 *
 * Hiyerarşi:
 *   holding → organizasyon → { iş → proje/rutin,  departman }
 *   holding → iş  (şirketi olmayan doğrudan bağlı işler)
 */
@Injectable()
export class ButceHiyerarsiService {
  constructor(
    private supabase: SupabaseService,
    private erisim: ButceErisimService
  ) {}

  /**
   * Bir bütçe sayfasının TÜM verisi tek uçtan.
   *
   * Parçalara bölünseydi (özet / hareketler / grafik ayrı istekler) ekran
   * bunları farklı anlarda alır ve arada bir kayıt eklenirse "toplam 40.000 ama
   * listedeki satırların toplamı 38.000" gibi kendi içinde çelişen bir ekran
   * ortaya çıkardı.
   */
  async sayfa(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<ButceSayfasi> {
    const yetki = await this.erisim.assertCanView(scopeType, scopeId, userId);

    const kapsamlar = await this.altKapsamlar(scopeType, scopeId);
    const [kendiHareketler, altHareketler] = await Promise.all([
      this.kademeHareketleri(scopeType, [scopeId]),
      this.altKademeHareketleri(kapsamlar),
    ]);

    const [ozet, duzenliOdemeler, onayBekleyenler] = await Promise.all([
      this.ozet(scopeType, scopeId, kendiHareketler, altHareketler, kapsamlar),
      this.duzenliOdemeler(scopeType, scopeId),
      // Onay kuyruğu yalnızca karar verecek kişiye anlamlı; başkasına boş gider.
      yetki.canApprove ? this.onayBekleyenGorevler(kapsamlar) : Promise.resolve([]),
    ]);

    // T tablosu ve grafikler ALT KADEMELER DAHİL toplam üzerinden: bir holdingin
    // T tablosunun yalnızca holdinge elle girilen iki satırı göstermesi
    // anlamsız olurdu. Aşağıdaki `hareketler` ise yalnızca bu kademenin kendi
    // defteri — orada düzenlenebilen satırlar onlar.
    const tumu = [...kendiHareketler, ...altHareketler];

    return {
      ozet,
      tTablolari: tTablolari(tumu),
      donemler: donemNoktalari(tumu, 12),
      hareketler: kendiHareketler,
      duzenliOdemeler,
      onayBekleyenler,
      yetki,
    };
  }

  /**
   * Bu kademenin ve ALTINDAKİ tüm kademelerin hareketleri, tek liste.
   *
   * Türev paneller (Finansal Analiz, Yönetim Analizi…) bunu okuyor: onların
   * sorusu "şirket bu dönemde ne kazandı" ve cevabı yalnızca şirkete elle
   * girilen satırlarla verilemez — departmanların ve projelerin hareketleri de
   * şirketin parasıdır.
   *
   * Sayfa ucundan ayrı duruyor çünkü orada `hareketler` bilerek yalnızca
   * kademenin KENDİ kayıtları: o listedeki satırlar ekranda düzenlenebiliyor,
   * alt kademenin kaydı ise kendi yerinde düzenlenmeli.
   */
  async tumHareketler(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<BudgetTransaction[]> {
    await this.erisim.assertCanView(scopeType, scopeId, userId);
    const kapsamlar = await this.altKapsamlar(scopeType, scopeId);
    const [kendi, alt] = await Promise.all([
      this.kademeHareketleri(scopeType, [scopeId]),
      this.altKademeHareketleri(kapsamlar),
    ]);
    return [...kendi, ...alt];
  }

  /** Kademe özeti: kendi / alt / toplam + bir alt kademedeki birimlerin kırılımı. */
  private async ozet(
    scopeType: ViewerKapsami,
    scopeId: string,
    kendiHareketler: BudgetTransaction[],
    altHareketler: BudgetTransaction[],
    kapsamlar: AltKapsamlar
  ): Promise<ButceKademeOzeti> {
    const kendi = paraBirimiBazinda(kendiHareketler);
    const alt = paraBirimiBazinda(altHareketler);
    return {
      scopeType,
      scopeId,
      ad: await this.erisim.kademeAdi(scopeType, scopeId),
      kendi,
      alt,
      toplam: toplamlariTopla(kendi, alt),
      cocuklar: await this.cocukOzetleri(scopeType, kapsamlar, [...kendiHareketler, ...altHareketler]),
    };
  }

  /**
   * Bir alt kademedeki birimlerin özetleri — holding için şirketleri, iş için
   * projeleri.
   *
   * Her çocuk için ayrı sorgu atılmıyor: üstte çekilen hareketler burada
   * yeniden gruplanıyor. 30 projesi olan bir işte 30 ek sorgu, sayfayı
   * kullanılamaz hâle getirirdi.
   */
  private async cocukOzetleri(
    scopeType: ViewerKapsami,
    kapsamlar: AltKapsamlar,
    tumHareketler: BudgetTransaction[]
  ): Promise<ButceKademeOzeti[]> {
    const cocuklar: { scopeType: BudgetScopeType; id: string; ad: string; icerdigi: (h: BudgetTransaction) => boolean }[] = [];

    if (scopeType === "group") {
      for (const org of kapsamlar.organizations) {
        const altJobIds = new Set(kapsamlar.jobs.filter((j) => j.organizationId === org.id).map((j) => j.id));
        const altDeptIds = new Set(kapsamlar.departments.filter((d) => d.organizationId === org.id).map((d) => d.id));
        const altProjectIds = new Set(kapsamlar.projects.filter((p) => altJobIds.has(p.jobId)).map((p) => p.id));
        const altOperationIds = new Set(kapsamlar.operations.filter((o) => altJobIds.has(o.jobId)).map((o) => o.id));
        cocuklar.push({
          scopeType: "organization",
          id: org.id,
          ad: org.ad,
          icerdigi: (h) =>
            h.organizationId === org.id ||
            (!!h.jobId && altJobIds.has(h.jobId)) ||
            (!!h.departmentId && altDeptIds.has(h.departmentId)) ||
            (!!h.projectId && altProjectIds.has(h.projectId)) ||
            (!!h.operationId && altOperationIds.has(h.operationId)),
        });
      }
      // Şirkete değil doğrudan holdinge bağlı işler.
      for (const job of kapsamlar.jobs.filter((j) => !j.organizationId)) {
        cocuklar.push(this.isCocugu(job, kapsamlar));
      }
    } else if (scopeType === "organization") {
      for (const job of kapsamlar.jobs) cocuklar.push(this.isCocugu(job, kapsamlar));
      for (const dept of kapsamlar.departments) {
        cocuklar.push({
          scopeType: "department",
          id: dept.id,
          ad: dept.ad,
          icerdigi: (h) => h.departmentId === dept.id,
        });
      }
    } else if (scopeType === "job") {
      for (const proje of kapsamlar.projects) {
        cocuklar.push({ scopeType: "project", id: proje.id, ad: proje.ad, icerdigi: (h) => h.projectId === proje.id });
      }
      for (const rutin of kapsamlar.operations) {
        cocuklar.push({
          scopeType: "operation",
          id: rutin.id,
          ad: rutin.ad,
          icerdigi: (h) => h.operationId === rutin.id,
        });
      }
    }
    // department: altında bütçe kademesi yok — görevler ayrı listede.

    return cocuklar.map((c) => {
      const kendi = paraBirimiBazinda(tumHareketler.filter(c.icerdigi));
      return { scopeType: c.scopeType, scopeId: c.id, ad: c.ad, kendi, alt: [], toplam: kendi, cocuklar: [] };
    });
  }

  private isCocugu(job: { id: string; ad: string }, kapsamlar: AltKapsamlar) {
    const projeIds = new Set(kapsamlar.projects.filter((p) => p.jobId === job.id).map((p) => p.id));
    const rutinIds = new Set(kapsamlar.operations.filter((o) => o.jobId === job.id).map((o) => o.id));
    return {
      scopeType: "job" as BudgetScopeType,
      id: job.id,
      ad: job.ad,
      icerdigi: (h: BudgetTransaction) =>
        h.jobId === job.id ||
        (!!h.projectId && projeIds.has(h.projectId)) ||
        (!!h.operationId && rutinIds.has(h.operationId)),
    };
  }

  // ------------------------------------------------------ Kapsam çözümlemesi

  /**
   * Bir kademenin ALTINDA kalan tüm birimlerin kimlikleri.
   *
   * Tek seferde çıkarılıyor: sonraki adımlarda hem hareketleri toplu çekmek
   * hem çocuk kırılımını üretmek için kullanılıyor, iki kez sorgulamaya değmez.
   *
   * `private` DEĞİL: kayıt eklerken seçilen hedefin gerçekten bu kademenin
   * ALTINDA olduğunu doğrulamak da aynı listeyi istiyor (bkz.
   * ButceKademeService.hedefiCoz). İkinci bir kopya, iki kuralın bir gün
   * ayrışması demekti.
   */
  async altKapsamlar(scopeType: ViewerKapsami, scopeId: string): Promise<AltKapsamlar> {
    const bos: AltKapsamlar = { organizations: [], jobs: [], departments: [], projects: [], operations: [] };

    if (scopeType === "department") return bos;

    if (scopeType === "job") {
      const [projects, operations] = await Promise.all([this.projeler([scopeId]), this.rutinler([scopeId])]);
      return { ...bos, projects, operations };
    }

    if (scopeType === "organization") {
      const [jobs, departments] = await Promise.all([this.isler({ organizationIds: [scopeId] }), this.departmanlar([scopeId])]);
      const jobIds = jobs.map((j) => j.id);
      const [projects, operations] = await Promise.all([this.projeler(jobIds), this.rutinler(jobIds)]);
      return { ...bos, jobs, departments, projects, operations };
    }

    // group
    const organizations = await this.organizasyonlar(scopeId);
    const orgIds = organizations.map((o) => o.id);
    // Holdingin işleri iki yoldan gelir: şirketleri üzerinden ve doğrudan.
    const [jobs, departments] = await Promise.all([
      this.isler({ organizationIds: orgIds, groupId: scopeId }),
      this.departmanlar(orgIds),
    ]);
    const jobIds = jobs.map((j) => j.id);
    const [projects, operations] = await Promise.all([this.projeler(jobIds), this.rutinler(jobIds)]);
    return { organizations, jobs, departments, projects, operations };
  }

  private async organizasyonlar(groupId: string) {
    const { data, error } = await this.supabase.client
      .from("organizations")
      .select("id, name")
      .eq("group_id", groupId)
      .is("archived_at", null)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((o: any) => ({ id: o.id as string, ad: o.name as string }));
  }

  private async isler(filtre: { organizationIds?: string[]; groupId?: string }) {
    const sonuclar: { id: string; ad: string; organizationId?: string }[] = [];
    const gorulen = new Set<string>();

    const ekle = (rows: any[]) => {
      for (const r of rows) {
        if (gorulen.has(r.id)) continue;
        gorulen.add(r.id);
        sonuclar.push({ id: r.id, ad: r.title, organizationId: r.organization_id ?? undefined });
      }
    };

    if (filtre.organizationIds?.length) {
      const { data, error } = await this.supabase.client
        .from("jobs")
        .select("id, title, organization_id")
        .in("organization_id", filtre.organizationIds)
        .is("archived_at", null)
        .limit(LISTE_TAVANI);
      if (error) throw error;
      ekle(data ?? []);
    }
    if (filtre.groupId) {
      const { data, error } = await this.supabase.client
        .from("jobs")
        .select("id, title, organization_id")
        .eq("group_id", filtre.groupId)
        .is("archived_at", null)
        .limit(LISTE_TAVANI);
      if (error) throw error;
      ekle(data ?? []);
    }
    return sonuclar;
  }

  private async departmanlar(organizationIds: string[]) {
    if (organizationIds.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from("departments")
      .select("id, name, organization_id")
      .in("organization_id", organizationIds)
      .is("archived_at", null)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((d: any) => ({ id: d.id as string, ad: d.name as string, organizationId: d.organization_id as string }));
  }

  private async projeler(jobIds: string[]) {
    if (jobIds.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from("projects")
      .select("id, title, job_id")
      .in("job_id", jobIds)
      .is("archived_at", null)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({ id: p.id as string, ad: p.title as string, jobId: p.job_id as string }));
  }

  private async rutinler(jobIds: string[]) {
    if (jobIds.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from("operations")
      .select("id, title, job_id")
      .in("job_id", jobIds)
      .is("archived_at", null)
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map((o: any) => ({ id: o.id as string, ad: o.title as string, jobId: o.job_id as string }));
  }

  // ----------------------------------------------------------- Hareketler

  private static readonly SUTUN: Record<string, string> = {
    group: "group_id",
    organization: "organization_id",
    job: "job_id",
    department: "department_id",
    project: "project_id",
    operation: "operation_id",
  };

  private async kademeHareketleri(scopeType: string, ids: string[]): Promise<BudgetTransaction[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select(SECIM)
      .in(ButceHiyerarsiService.SUTUN[scopeType], ids)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  /**
   * Alt kademelerin TÜM hareketleri.
   *
   * Kademe başına tek sorgu (beş sorgu değil beş kademe için beş) — kimlik
   * listeleri `in()` ile toplu gidiyor. Hiçbir alt birim yoksa sorgu hiç
   * atılmıyor: boş `in()` PostgREST'te tüm tabloyu döndürme riski taşır.
   */
  private async altKademeHareketleri(kapsamlar: AltKapsamlar): Promise<BudgetTransaction[]> {
    const istekler: Promise<BudgetTransaction[]>[] = [];
    const ekle = (scopeType: string, ids: string[]) => {
      if (ids.length > 0) istekler.push(this.kademeHareketleri(scopeType, ids));
    };
    ekle("organization", kapsamlar.organizations.map((o) => o.id));
    ekle("job", kapsamlar.jobs.map((j) => j.id));
    ekle("department", kapsamlar.departments.map((d) => d.id));
    ekle("project", kapsamlar.projects.map((p) => p.id));
    ekle("operation", kapsamlar.operations.map((o) => o.id));
    const sonuclar = await Promise.all(istekler);
    return sonuclar.flat();
  }

  private async duzenliOdemeler(scopeType: string, scopeId: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq(ButceHiyerarsiService.SUTUN[scopeType], scopeId)
      .order("next_due_date", { ascending: true })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(mapRecurringPayment);
  }

  /**
   * Bu kademenin altında KARAR ya da ÖDEME bekleyen görev bütçeleri.
   *
   * Yöneticinin bu ekranda yapacağı asıl iş bu: "bir görev için para gerekiyor"
   * talebi buraya düşer. Kuyruk kademenin ALTINDAKİ tüm proje ve departmanları
   * kapsar — holding sahibi tek ekrandan hepsini görebilsin diye.
   *
   * ONAYLANMIŞ (planned) talepler de listede kalır: onay bir taahhüttür, kasadan
   * para henüz çıkmamıştır. Listeden düşselerdi onaylanan görevin ödeme adımını
   * hatırlatan hiçbir şey kalmaz ve defterde hiç görünmezlerdi.
   */
  private async onayBekleyenGorevler(kapsamlar: AltKapsamlar): Promise<GorevButceTalebi[]> {
    const projectIds = kapsamlar.projects.map((p) => p.id);
    const departmentIds = kapsamlar.departments.map((d) => d.id);
    if (projectIds.length === 0 && departmentIds.length === 0) return [];

    const sorgu = (sutun: string, ids: string[]) =>
      this.supabase.client
        .from("tasks")
        .select(
          "id, title, project_id, department_id, budget, budget_currency, budget_status, budget_requested_by, budget_requested_at, budget_decided_by, budget_decided_at, budget_note, deadline, projects(title), departments(name), talep:users!tasks_budget_requested_by_fkey(full_name), karar:users!tasks_budget_decided_by_fkey(full_name)"
        )
        .in(sutun, ids)
        .in("budget_status", ["pending", "planned"])
        .gt("budget", 0)
        .limit(LISTE_TAVANI);

    const istekler: any[] = [];
    if (projectIds.length > 0) istekler.push(sorgu("project_id", projectIds));
    if (departmentIds.length > 0) istekler.push(sorgu("department_id", departmentIds));

    const sonuclar = await Promise.all(istekler);
    const satirlar: any[] = [];
    for (const s of sonuclar) {
      if (s.error) throw s.error;
      satirlar.push(...(s.data ?? []));
    }
    // Karar bekleyenler önce (yapılacak iş onlar), sonra ödeme bekleyenler.
    // Her grup içinde en eski talep üstte: ne kadar beklediyse o kadar acil.
    satirlar.sort(
      (a, b) =>
        (a.budget_status === "pending" ? 0 : 1) - (b.budget_status === "pending" ? 0 : 1) ||
        String(a.budget_requested_at ?? "").localeCompare(String(b.budget_requested_at ?? ""))
    );
    return satirlar.map(mapTalep);
  }
}

export interface AltKapsamlar {
  organizations: { id: string; ad: string }[];
  jobs: { id: string; ad: string; organizationId?: string }[];
  departments: { id: string; ad: string; organizationId: string }[];
  projects: { id: string; ad: string; jobId: string }[];
  operations: { id: string; ad: string; jobId: string }[];
}

export function mapTalep(row: any): GorevButceTalebi {
  return {
    taskId: row.id,
    title: row.title,
    projectId: row.project_id ?? undefined,
    projectTitle: row.projects?.title ?? undefined,
    departmentId: row.department_id ?? undefined,
    departmentName: row.departments?.name ?? undefined,
    amount: Number(row.budget ?? 0),
    currency: row.budget_currency || "TRY",
    status: row.budget_status ?? "pending",
    requestedBy: row.budget_requested_by ?? undefined,
    requestedByName: row.talep?.full_name ?? undefined,
    requestedAt: row.budget_requested_at ?? undefined,
    decidedBy: row.budget_decided_by ?? undefined,
    decidedByName: row.karar?.full_name ?? undefined,
    decidedAt: row.budget_decided_at ?? undefined,
    note: row.budget_note ?? undefined,
    deadline: row.deadline ?? undefined,
  };
}
