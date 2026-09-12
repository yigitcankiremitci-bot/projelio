import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { RecurrenceInterval, RecurringPayment } from "@projelio/shared";
import { RECURRENCE_INTERVALS } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { requireAmount, requireOneOf, optionalOneOf } from "../../common/validation/input";
import { BudgetService } from "./budget.service";
import { islenecekDonemler } from "./vade";
// Eşleştirme ortak dosyada: aynı satır artık altı ayrı yerden okunuyor ve her
// kopya, yeni bir sütun eklendiğinde birinde unutulmak demekti.
import { mapRecurringPayment as mapPayment } from "./butce-eslestirme";

// Tarih hesabı vade.ts'te (testten import edilebilsin diye); buradan yeniden
// dışa aktarılıyor ki mevcut çağrı yerleri değişmesin.
export { advanceDueDate, islenecekDonemler, toDateString } from "./vade";

// Liste SÖZLÜKTEN (packages/shared): 3/6 aylık aralıklar eklenince buradaki
// kopya eksik kalmış ve kişisel Kasa yolunda bu aralıklar reddediliyordu.
const INTERVALS: RecurrenceInterval[] = RECURRENCE_INTERVALS;

/**
 * recurring_payments.type için izin verilen değerler — 020_budget_ledger_and_recurring.sql
 * içindeki CHECK kısıtıyla birebir aynı. (budget_transactions'tan farklı: burada
 * "payout" yok.)
 */
const RECURRING_TYPES = ["income", "expense"] as const;

@Injectable()
export class RecurringPaymentsService {
  constructor(
    private supabase: SupabaseService,
    private budgetService: BudgetService
  ) {}

  async findAllForUser(userId: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("owner_id", userId)
      .order("next_due_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  async create(userId: string, data: Partial<RecurringPayment>): Promise<RecurringPayment> {
    this.assertValid(data);
    if (data.projectId) await this.assertOwnsProject(data.projectId, userId);

    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .insert({
        owner_id: userId,
        project_id: data.projectId ?? null,
        type: requireOneOf(data.type ?? "expense", RECURRING_TYPES, "Ödeme türü"),
        amount: requireAmount(data.amount ?? 0),
        description: data.description ?? null,
        interval: data.interval,
        next_due_date: data.nextDueDate,
        // Çapa gün ilk vade tarihinden türetilir.
        anchor_day: Number(data.nextDueDate!.split("-")[2]),
        reminder_days_before: data.reminderDaysBefore ?? 1,
        active: data.active ?? true,
      })
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    return mapPayment(row);
  }

  async update(id: string, userId: string, data: Partial<RecurringPayment>): Promise<RecurringPayment> {
    await this.assertOwner(id, userId);
    if (data.projectId) await this.assertOwnsProject(data.projectId, userId);

    const patch: Record<string, any> = {};
    // Bu iki alan create()'te assertValid()'ten geçiyordu ama update() yolunda hiç
    // kontrol edilmiyordu: mevcut bir düzenli ödemenin tutarı negatife çekilebiliyordu.
    if (data.type !== undefined) patch.type = optionalOneOf(data.type, RECURRING_TYPES, "Ödeme türü");
    if (data.amount !== undefined) patch.amount = this.assertPositiveAmount(data.amount);
    if (data.description !== undefined) patch.description = data.description || null;
    if (data.interval !== undefined) {
      if (!INTERVALS.includes(data.interval)) throw new BadRequestException("Geçersiz tekrar aralığı");
      patch.interval = data.interval;
    }
    if (data.nextDueDate !== undefined) {
      patch.next_due_date = data.nextDueDate;
      patch.anchor_day = Number(data.nextDueDate.split("-")[2]);
    }
    if (data.reminderDaysBefore !== undefined) patch.reminder_days_before = data.reminderDaysBefore;
    if (data.active !== undefined) patch.active = data.active;
    if (data.projectId !== undefined) patch.project_id = data.projectId || null;

    const { data: row, error } = await this.supabase.client
      .from("recurring_payments")
      .update(patch)
      .eq("id", id)
      .select("*, projects(title)")
      .single();
    if (error) throw error;
    return mapPayment(row);
  }

  async remove(id: string, userId: string): Promise<{ success: true }> {
    await this.assertOwner(id, userId);
    const { error } = await this.supabase.client.from("recurring_payments").delete().eq("id", id);
    if (error) throw error;
    return { success: true };
  }

  // Cron için: vadesi bugün ya da geçmişte olan aktif ödemeler.
  async findDue(today: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("active", true)
      .lte("next_due_date", today);
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  // Cron için: vadesine reminder_days_before kadar kalan aktif ödemeler.
  async findUpcoming(today: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("active", true)
      .gt("next_due_date", today);
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  async markProcessed(id: string, nextDueDate: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("recurring_payments")
      .update({ next_due_date: nextDueDate, last_run_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }

  /**
   * Bir projeye bağlı düzenli ödemeler.
   *
   * Sahibine değil PROJEYE bakar: proje bütçesini görebilen (ör. "bütçeyi
   * görebilir" izni olan üye) projenin düzenli yüklerini de görmeli. Erişim
   * denetimi çağıran uçta (bkz. BudgetController).
   */
  async findByProject(projectId: string): Promise<RecurringPayment[]> {
    const { data, error } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("project_id", projectId)
      .order("next_due_date", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapPayment);
  }

  /**
   * Ödemeyi deftere işler ve vadeyi ilerletir.
   *
   * Cron da (RecurringPaymentsProcessor) elle "Ödendi" de buradan geçiyor.
   * Bildirimi burada GÖNDERMİYORUZ: cron'un bildirimi "haberin olsun" demek,
   * kullanıcının kendi bastığı düğme için aynı bildirim gürültü olurdu.
   */
  async islet(payment: RecurringPayment, today: string): Promise<{ olusanIdler: string[]; sonrakiVade: string }> {
    const { tarihler, sonrakiVade } = islenecekDonemler(
      payment.nextDueDate,
      payment.interval,
      payment.anchorDay,
      today
    );

    const olusanIdler: string[] = [];
    for (const tarih of tarihler) {
      const tx = await this.budgetService.createRecurringTransaction(payment, tarih);
      olusanIdler.push(tx.id);
    }
    if (olusanIdler.length > 0) await this.markProcessed(payment.id, sonrakiVade);
    return { olusanIdler, sonrakiVade };
  }

  /**
   * Kullanıcının "Ödendi" düğmesi.
   *
   * Vadesi geçmiş bir ödeme, ertesi sabah cron koşana kadar kasada "gecikti"
   * diye duruyor ve kullanıcının yapabileceği hiçbir şey yoktu — ödemeyi
   * gerçekten yapmış olsa bile. Dönen değer geri almaya yetecek kadarını
   * taşıyor: oluşan kayıtların id'leri ve ÖNCEKİ vade.
   */
  async odendiIsaretle(
    id: string,
    userId: string,
    today: string
  ): Promise<{ payment: RecurringPayment; olusanIdler: string[]; oncekiVade: string }> {
    await this.assertOwner(id, userId);
    const { data: row } = await this.supabase.client
      .from("recurring_payments")
      .select("*, projects(title)")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Düzenli ödeme bulunamadı");

    const payment = mapPayment(row);
    // Duraklatılmış ödeme takipte değildir; işlemek onu sessizce geri açardı.
    if (!payment.active) throw new BadRequestException("Duraklatılmış bir ödeme işlenemez");

    const oncekiVade = payment.nextDueDate;
    const { olusanIdler, sonrakiVade } = await this.islet(payment, today);
    return { payment: { ...payment, nextDueDate: sonrakiVade }, olusanIdler, oncekiVade };
  }

  private assertValid(data: Partial<RecurringPayment>): void {
    if (!data.interval || !INTERVALS.includes(data.interval)) {
      throw new BadRequestException("Geçersiz tekrar aralığı");
    }
    if (!data.nextDueDate) throw new BadRequestException("İlk ödeme tarihi gerekli");
    this.assertPositiveAmount(data.amount);
  }

  /**
   * Düzenli ödemede tutar sıfır olamaz (sıfırlık bir ödemeyi tekrarlamanın anlamı yok),
   * bu yüzden requireAmount'un ">= 0" kuralının üstüne "> 0" ekleniyor. Üst sınır ve
   * sayı/metin çevrimi requireAmount'tan geliyor.
   */
  private assertPositiveAmount(value: unknown): number {
    const amount = requireAmount(value);
    if (amount <= 0) throw new BadRequestException("Tutar sıfırdan büyük olmalı");
    return amount;
  }

  private async assertOwner(id: string, userId: string): Promise<void> {
    const { data: row } = await this.supabase.client
      .from("recurring_payments")
      .select("owner_id")
      .eq("id", id)
      .maybeSingle();
    if (!row) throw new NotFoundException("Düzenli ödeme bulunamadı");
    if (row.owner_id !== userId) throw new ForbiddenException("Bu kaydı düzenleme yetkin yok");
  }

  private async assertOwnsProject(projectId: string, userId: string): Promise<void> {
    const { data: project } = await this.supabase.client
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new NotFoundException("Proje bulunamadı");
    if (project.owner_id !== userId) throw new ForbiddenException("Bu projeye bağlayamazsın");
  }
}
