import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { BudgetTransaction, RecurringPayment } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireAmount, requireOneOf, optionalOneOf, paraBirimiDogrula } from "../../common/validation/input";
import { LISTE_TAVANI } from "../../common/liste-tavani";
import { ButceErisimService } from "./butce-erisim.service";
import type { ViewerKapsami } from "./butce-erisim";
import { mapRecurringPayment, mapTransaction, SECIM } from "./butce-eslestirme";

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
const RECURRENCE_INTERVALS = ["weekly", "monthly", "yearly"] as const;
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
    private erisim: ButceErisimService
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

  async ekle(
    scopeType: ViewerKapsami,
    scopeId: string,
    data: Partial<BudgetTransaction>,
    userId?: string
  ): Promise<BudgetTransaction> {
    await this.erisim.assertCanManage(scopeType, scopeId, userId);

    const { data: row, error } = await this.supabase.client
      .from("budget_transactions")
      .insert({
        [SUTUN[scopeType]]: scopeId,
        // Defter sahibi kaydı GİREN değil, paranın sahibi olan kademenin
        // sahibidir (bkz. migration 100). Kaydı giren created_by'da durur.
        owner_id: await this.defterSahibi(scopeType, scopeId),
        created_by: userId ?? null,
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
      .select("*, projects(title)")
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
      .select("*, projects(title)")
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
