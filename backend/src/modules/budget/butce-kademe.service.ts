import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetTransaction, RecurringPayment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireAmount, requireOneOf, optionalOneOf, paraBirimiDogrula } from "../../common/validation/input";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { ButceErisimService } from "./butce-erisim.service";
import type { ViewerKapsami } from "./butce-erisim";
import { mapRecurringPayment, mapTransaction, SECIM, DUZENLI_SECIM } from "./butce-eslestirme";
import { ButceHiyerarsiService } from "./butce-hiyerarsi.service";
import { advanceDueDate } from "./vade";
import { RECURRENCE_INTERVALS } from "@projelio/shared";

/**
 * İş / departman / şirket / holding bütçelerinin ortak defter işlemleri.
 *
 * DÖRDÜ DE AYNI KODDAN GEÇER. Departman bütçesi tek başına yazılmışken
 * (029) 020'deki "defter sahibi" kuralı atlanmış ve departman kayıtları
 * aylarca hiçbir deftere ait olmamıştı — Kasa'da ne listede ne toplamda
 * göründüler (bkz. migration 100). Dört kademe için dört kopya kod, o hatanın
 * dört kez tekrarlanacağı anlamına gelirdi.
 *
 * Proje ve rutin kademesi burada DEĞİL: onların kuralı (anlaşılan ücret,
 * tahsilat ilerlemesi, project_members.can_view_budget) farklı ve zaten
 * BudgetService içinde çalışıyor.
 */

/** budget_transactions.type için izin verilen değerler (001'deki CHECK ile aynı). */
const TRANSACTION_TYPES = ["income", "expense", "payout"] as const;
const RECURRING_TYPES = ["income", "expense"] as const;

/** Kademe → budget_transactions'taki kimlik sütunu. */
const SUTUN: Record<ViewerKapsami, string> = {
  job: "job_id",
  department: "department_id",
  organization: "organization_id",
  group: "group_id",
};

@Injectable()
export class ButceKademeService {
  constructor(
    private supabase: SupabaseService,
    private erisim: ButceErisimService,
    private hiyerarsi: ButceHiyerarsiService
  ) {}

  // ------------------------------------------------------------- Hareketler

  async hareketler(scopeType: ViewerKapsami, scopeId: string, userId?: string): Promise<BudgetTransaction[]> {
    await this.erisim.assertCanView(scopeType, scopeId, userId);
    const { data, error } = await this.supabase.client
      .from("budget_transactions")
      .select(SECIM)
      .eq(SUTUN[scopeType], scopeId)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(LISTE_TAVANI);
    if (error) throw error;
    return (data ?? []).map(mapTransaction);
  }

  /**
   * Kademeye kayıt ekler.
   *
   * HEDEF SEÇİMİ: kayıt, açık olan sayfanın kademesine yazılır — ama kullanıcı
   * "bu gider aslında şu projeye ait" diyebilir. O zaman kayıt PROJENİN
   * defterine düşer ve oradan yukarı toplanır.
   *
   * Bu üstteki toplamı BOZMAZ: alt kademe zaten üste toplanıyor, yani kayıt
   * aşağı indiğinde şirketin rakamı değişmez, yalnızca detaylanır. Toplamı
   * değiştirmeden detay kazandırdığı için hedef seçimi serbest bırakıldı.
   *
   * Göreve bağlama ayrı bir alan: görev bir kademe değil, kademenin içinde
   * yaşayan bir kayıt. Bir göreve BİRDEN FAZLA masraf yazılabilir (veritabanı
   * tekilliği yalnızca otomatik üretilen ödeme satırına uygulanıyor, bkz.
   * migration 105).
   */
  async ekle(
    scopeType: ViewerKapsami,
    scopeId: string,
    data: Partial<BudgetTransaction> & { hedefTur?: string; hedefId?: string },
    userId?: string
  ): Promise<BudgetTransaction> {
    await this.erisim.assertCanManage(scopeType, scopeId, userId);

    const hedef = await this.hedefiCoz(scopeType, scopeId, data);

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        [hedef.sutun]: hedef.id,
        // Defter sahibi kaydı GİREN değil, paranın sahibi olan kademenin
        // sahibidir (bkz. migration 100). Kaydı giren created_by'da durur.
        owner_id: hedef.ownerId,
        created_by: userId ?? null,
        task_id: hedef.taskId,
        source: "manual",
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

  /**
   * Kaydın hangi kademeye ve hangi göreve yazılacağını çözer.
   *
   * KURAL: hedef, açık olan kademenin ALTINDA olmalı. Aksi hâlde bir holding
   * sahibi, kendi holdingine ait olmayan bir projenin defterine kayıt
   * yazabilirdi — üstelik o projenin sahibinin haberi olmadan. Kontrol
   * "hedefin kimliği alt kapsam listesinde mi" diye yapılıyor; liste zaten
   * sayfanın kendisi için de çıkarılan liste (bkz. altKapsamlar).
   *
   * Hedef verilmemişse kayıt, sayfanın kendi kademesine yazılır — eski davranış.
   */
  private async hedefiCoz(
    scopeType: ViewerKapsami,
    scopeId: string,
    data: { hedefTur?: string; hedefId?: string; taskId?: string }
  ): Promise<{ sutun: string; id: string; ownerId: string | null; taskId: string | null }> {
    const gorev = data.taskId ? await this.gorevKapsami(data.taskId) : null;

    // Görev seçildiyse ve ayrıca bir kademe seçilmediyse, kademe GÖREVDEN gelir:
    // bir görevin masrafı, görevin yaşadığı yerin defterine aittir.
    const hedefTur = data.hedefTur || (gorev ? gorev.tur : "");
    const hedefId = data.hedefId || (gorev ? gorev.id : "");

    if (!hedefTur || !hedefId || (hedefTur === scopeType && hedefId === scopeId)) {
      return {
        sutun: SUTUN[scopeType],
        id: scopeId,
        ownerId: await this.defterSahibi(scopeType, scopeId),
        taskId: data.taskId || null,
      };
    }

    const kapsamlar = await this.hiyerarsi.altKapsamlar(scopeType, scopeId);
    const izinli: Record<string, { sutun: string; idler: Set<string> }> = {
      organization: { sutun: "organization_id", idler: new Set(kapsamlar.organizations.map((o) => o.id)) },
      job: { sutun: "job_id", idler: new Set(kapsamlar.jobs.map((j) => j.id)) },
      department: { sutun: "department_id", idler: new Set(kapsamlar.departments.map((d) => d.id)) },
      project: { sutun: "project_id", idler: new Set(kapsamlar.projects.map((p) => p.id)) },
      operation: { sutun: "operation_id", idler: new Set(kapsamlar.operations.map((o) => o.id)) },
    };

    const secim = izinli[hedefTur];
    if (!secim) throw new BadRequestException("Tanınmayan hedef türü");
    if (!secim.idler.has(hedefId)) {
      throw new ForbiddenException("Seçilen hedef bu bütçenin altında değil");
    }

    return {
      sutun: secim.sutun,
      id: hedefId,
      ownerId: await this.hedefDefterSahibi(hedefTur, hedefId),
      taskId: data.taskId || null,
    };
  }

  /** Görevin hangi kademede yaşadığı — masrafı oraya yazılsın diye. */
  private async gorevKapsami(taskId: string): Promise<{ tur: string; id: string } | null> {
    const { data } = await this.supabase.client
      .from("tasks")
      .select("project_id, department_id, operation_id")
      .eq("id", taskId)
      .maybeSingle();
    if (!data) throw new NotFoundException("Görev bulunamadı");
    if (data.project_id) return { tur: "project", id: data.project_id };
    if (data.department_id) return { tur: "department", id: data.department_id };
    if (data.operation_id) return { tur: "operation", id: data.operation_id };
    return null;
  }

  /** Proje/rutin de dahil, her hedef türü için defter sahibi. */
  private async hedefDefterSahibi(hedefTur: string, hedefId: string): Promise<string | null> {
    if (hedefTur === "project") {
      const { data } = await this.supabase.client.from("projects").select("owner_id").eq("id", hedefId).maybeSingle();
      return data?.owner_id ?? null;
    }
    if (hedefTur === "operation") {
      const { data } = await this.supabase.client.from("operations").select("owner_id").eq("id", hedefId).maybeSingle();
      return data?.owner_id ?? null;
    }
    return this.defterSahibi(hedefTur as ViewerKapsami, hedefId);
  }

  /**
   * Kaydın kademesi SATIRDAN okunur, istemciden değil: kullanıcı başkasının
   * kaydının kimliğini gönderip kendi yetkili olduğu kademenin kuralıyla
   * düzenleyemesin diye.
   */
  async guncelle(id: string, data: Partial<BudgetTransaction>, userId?: string): Promise<BudgetTransaction> {
    const satir = await this.yonetilebilirSatir(id, userId);

    const patch: Record<string, unknown> = {};
    if (data.type !== undefined) patch.type = optionalOneOf(data.type, TRANSACTION_TYPES, "İşlem türü");
    if (data.amount !== undefined) patch.amount = requireAmount(data.amount);
    if (data.currency !== undefined) patch.currency = paraBirimiDogrula(data.currency);
    // Boş değer "temizle" demektir; undefined ise alan hiç gönderilmemiştir.
    if (data.category !== undefined) patch.category = data.category?.trim() || null;
    if (data.counterpartyId !== undefined) patch.counterparty_id = data.counterpartyId || null;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.occurredAt !== undefined) patch.occurred_at = data.occurredAt.slice(0, 10);
    // Görev bağı sonradan kurulabilir/kaldırılabilir: "bu masraf aslında şu
    // görev içindi" çoğu zaman kayıt girildikten sonra fark ediliyor. Boş
    // değer bağı koparır. Otomatik üretilmiş satırlarda buna izin verilmez
    // (aşağıdaki yonetilebilirSatir kontrolü), yoksa ödeme satırının kaynağı
    // kaybolurdu.
    if (data.taskId !== undefined) patch.task_id = data.taskId || null;
    // Kademe DEĞİŞTİRİLEMEZ: kaydı başka bir şirkete taşımak, iki kademenin
    // geçmiş toplamlarını aynı anda değiştirir ve kimse farkı göremez.

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .update(patch)
      .eq("id", satir.id)
      .select(SECIM)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Kayıt bulunamadı");
    return mapTransaction(row);
  }

  async sil(id: string, userId?: string): Promise<{ success: true }> {
    const satir = await this.yonetilebilirSatir(id, userId);
    const { error } = await this.supabase.client.from("budget_transactions").delete().eq("id", satir.id);
    if (error) throw error;
    return { success: true };
  }

  /** Kaydı bulur, kademesini çıkarır ve yönetme yetkisini doğrular. */
  private async yonetilebilirSatir(id: string, userId?: string): Promise<{ id: string; scopeType: ViewerKapsami }> {
    const { data: row } = await this.supabase.client
      .from("budget_transactions")
      .select("id, job_id, department_id, organization_id, group_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Kayıt bulunamadı");

    const kademe = this.satirinKademesi(row);
    if (!kademe) throw new NotFoundException("Kayıt bu bütçe kademesine ait değil");
    await this.erisim.assertCanManage(kademe.scopeType, kademe.scopeId, userId);
    return { id: row.id, scopeType: kademe.scopeType };
  }

  private satirinKademesi(row: any): { scopeType: ViewerKapsami; scopeId: string } | null {
    if (row.group_id) return { scopeType: "group", scopeId: row.group_id };
    if (row.organization_id) return { scopeType: "organization", scopeId: row.organization_id };
    if (row.job_id) return { scopeType: "job", scopeId: row.job_id };
    if (row.department_id) return { scopeType: "department", scopeId: row.department_id };
    return null;
  }

  /**
   * Kaydın ait olacağı DEFTERİN sahibi.
   *
   * Departmanda organizasyonun sahibi — departman yöneticisi değil. Kural
   * 020'de kondu ve gerekçesi hâlâ geçerli: defter, paranın sahibinin
   * defteridir. Kişisel Kasa kayıtları bu sütunla süzüyor; boş bırakılırsa
   * kayıt hiçbir deftere ait olmaz ve Kasa'da görünmez (bkz. migration 100).
   */
  private async defterSahibi(scopeType: ViewerKapsami, scopeId: string): Promise<string | null> {
    if (scopeType === "group") {
      const { data } = await this.supabase.client.from("groups").select("owner_id").eq("id", scopeId).maybeSingle();
      return data?.owner_id ?? null;
    }
    if (scopeType === "organization") {
      const { data } = await this.supabase.client.from("organizations").select("owner_id").eq("id", scopeId).maybeSingle();
      return data?.owner_id ?? null;
    }
    if (scopeType === "job") {
      const { data } = await this.supabase.client.from("jobs").select("owner_id").eq("id", scopeId).maybeSingle();
      return data?.owner_id ?? null;
    }
    const { data: dept } = await this.supabase.client
      .from("departments")
      .select("organization_id")
      .eq("id", scopeId)
      .maybeSingle();
    if (!dept?.organization_id) return null;
    const { data: org } = await this.supabase.client
      .from("organizations")
      .select("owner_id")
      .eq("id", dept.organization_id)
      .maybeSingle();
    return org?.owner_id ?? null;
  }

  // -------------------------------------------------- Düzenli gelir/giderler

  /**
   * Deftere girilmiş TEK SEFERLİK bir kaydı düzenli gelir/gidere çevirir.
   *
   * NEDEN VAR: kira, abonelik, maaş gibi kalemler ilk kez elle giriliyor ve
   * ancak ikinci ay "bu her ay tekrarlıyor" fark ediliyor. O noktada
   * kullanıcının elinde iki kötü seçenek vardı: kaydı silip düzenli olarak
   * yeniden kurmak (defterde geçmiş kaybolur) ya da her ay elle yazmak.
   *
   * MEVCUT KAYIT DURUR, silinmez: o para gerçekten çıktı ve defterde kalmalı.
   * Yeni düzenli ödeme, o kaydın BİR SONRAKİ vadesinden başlar — aksi hâlde
   * aynı ay iki kez işlenir ve gider iki katı görünürdü.
   */
  async duzenliyeCevir(
    id: string,
    data: { interval?: string; reminderDaysBefore?: number },
    userId?: string
  ): Promise<RecurringPayment> {
    const { data: kayit } = await this.supabase.client
      .from("budget_transactions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!kayit) throw new NotFoundException("Kayıt bulunamadı");

    const kademe = this.satirinKademesi(kayit);
    if (kademe) await this.erisim.assertCanManage(kademe.scopeType, kademe.scopeId, userId);
    else if (userId && kayit.owner_id !== userId) {
      throw new ForbiddenException("Bu kaydı düzenli hâle getirme yetkin yok");
    }

    // Hakediş/ödeme (payout) düzenliye çevrilemez: recurring_payments yalnızca
    // income/expense tanıyor (020'deki CHECK) ve bir görev ödemesinin kendini
    // her ay tekrarlaması zaten istenmez.
    if (kayit.type === "payout") {
      throw new BadRequestException("Hakediş/ödeme kayıtları düzenli hâle getirilemez");
    }
    if (kayit.recurring_payment_id) {
      throw new BadRequestException("Bu kayıt zaten bir düzenli ödemeden üretilmiş");
    }

    const interval = requireOneOf(data.interval ?? "monthly", RECURRENCE_INTERVALS, "Tekrar aralığı");
    const ilkTarih = String(kayit.occurred_at).slice(0, 10);
    const anchorDay = Number(ilkTarih.slice(8, 10));
    // Sıradaki vade, mevcut kaydın tarihinden BİR DÖNEM SONRASI: bu ayın
    // gideri zaten defterde duruyor.
    const sonrakiVade = advanceDueDate(ilkTarih, interval, anchorDay);

    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .insert({
        project_id: kayit.project_id,
        department_id: kayit.department_id,
        job_id: kayit.job_id,
        organization_id: kayit.organization_id,
        group_id: kayit.group_id,
        owner_id: kayit.owner_id,
        task_id: kayit.task_id,
        type: kayit.type,
        amount: kayit.amount,
        currency: kayit.currency || "TRY",
        category: kayit.category,
        description: kayit.description,
        interval,
        next_due_date: sonrakiVade,
        anchor_day: anchorDay,
        reminder_days_before: data.reminderDaysBefore ?? 1,
        active: true,
      })
      .select(DUZENLI_SECIM)
      .single();
    if (error) throw error;

    // Kaynak kayıt artık düzenli ödemeye bağlı: ekranda "bu satırdan doğdu"
    // izlenebilsin ve aynı kayıt ikinci kez çevrilmeye kalkılmasın.
    await this.supabase.client.from("budget_transactions").update({ recurring_payment_id: row.id }).eq("id", id);

    return mapRecurringPayment(row);
  }

  /**
   * Kademeye bağlı düzenli ödeme ekler.
   *
   * Kira, maaş, abonelik gibi giderler projeye değil ŞİRKETE aittir ve düzenli
   * ödemelerin en yaygın kullanımı tam olarak bunlar; kademe sütunları eklenene
   * kadar (migration 104) bu mümkün değildi.
   */
  async duzenliEkle(
    scopeType: ViewerKapsami,
    scopeId: string,
    data: Partial<RecurringPayment>,
    userId?: string
  ): Promise<RecurringPayment> {
    await this.erisim.assertCanManage(scopeType, scopeId, userId);

    const nextDueDate = data.nextDueDate?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .insert({
        [SUTUN[scopeType]]: scopeId,
        owner_id: await this.defterSahibi(scopeType, scopeId),
        type: requireOneOf(data.type ?? "expense", RECURRING_TYPES, "İşlem türü"),
        amount: requireAmount(data.amount ?? 0),
        currency: paraBirimiDogrula(data.currency),
        category: data.category?.trim() || null,
        description: data.description ?? null,
        interval: requireOneOf(data.interval ?? "monthly", RECURRENCE_INTERVALS, "Tekrar aralığı"),
        next_due_date: nextDueDate,
        // Ayın kaçında tekrarlandığı ilk vadeden alınır: "her ayın 31'i" olan
        // bir ödeme Şubat'ta 28'e çekilse de sonraki ay 31'e dönebilsin diye
        // asıl gün burada sabit tutulur (bkz. vade.ts).
        anchor_day: data.anchorDay ?? Number(nextDueDate.slice(8, 10)),
        reminder_days_before: data.reminderDaysBefore ?? 1,
        active: data.active ?? true,
      })
      .select(DUZENLI_SECIM)
      .single();
    if (error) throw error;
    return mapRecurringPayment(row);
  }

  async duzenliGuncelle(id: string, data: Partial<RecurringPayment>, userId?: string): Promise<RecurringPayment> {
    const satir = await this.yonetilebilirDuzenli(id, userId);

    const patch: Record<string, unknown> = {};
    if (data.type !== undefined) patch.type = optionalOneOf(data.type, RECURRING_TYPES, "İşlem türü");
    if (data.amount !== undefined) patch.amount = requireAmount(data.amount);
    if (data.currency !== undefined) patch.currency = paraBirimiDogrula(data.currency);
    if (data.category !== undefined) patch.category = data.category?.trim() || null;
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.interval !== undefined) patch.interval = optionalOneOf(data.interval, RECURRENCE_INTERVALS, "Tekrar aralığı");
    if (data.nextDueDate !== undefined) {
      patch.next_due_date = data.nextDueDate.slice(0, 10);
      patch.anchor_day = Number(data.nextDueDate.slice(8, 10));
    }
    if (data.reminderDaysBefore !== undefined) patch.reminder_days_before = data.reminderDaysBefore;
    if (data.active !== undefined) patch.active = data.active;

    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .update(patch)
      .eq("id", satir)
      .select(DUZENLI_SECIM)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new NotFoundException("Düzenli ödeme bulunamadı");
    return mapRecurringPayment(row);
  }

  async duzenliSil(id: string, userId?: string): Promise<{ success: true }> {
    const satir = await this.yonetilebilirDuzenli(id, userId);
    const { error } = await this.supabase.client.from("recurring_payments").delete().eq("id", satir);
    if (error) throw error;
    return { success: true };
  }

  private async yonetilebilirDuzenli(id: string, userId?: string): Promise<string> {
    const { data: row } = await this.supabase.client
      .from("recurring_payments")
      .select("id, job_id, department_id, organization_id, group_id, owner_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Düzenli ödeme bulunamadı");

    const kademe = this.satirinKademesi(row);
    if (!kademe) {
      // Kişisel/proje düzenli ödemesi: sahibinden başkası dokunamaz.
      if (userId && row.owner_id !== userId) throw new ForbiddenException("Bu düzenli ödemeyi düzenleme yetkin yok");
      return row.id;
    }
    await this.erisim.assertCanManage(kademe.scopeType, kademe.scopeId, userId);
    return row.id;
  }

}
