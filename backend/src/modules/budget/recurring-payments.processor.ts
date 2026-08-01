import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { RecurringPayment } from "@projelio/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { BudgetService } from "./budget.service";
import { RecurringPaymentsService, advanceDueDate, toDateString } from "./recurring-payments.service";

function formatAmount(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

function daysBetween(fromDate: string, toDateStr: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDateStr.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Düzenli ödemeler: her sabah 08:00'de çalışır.
 * - Vadesi gelmiş (bugün ya da geçmiş) ödemeler için bütçeye otomatik kayıt atar,
 *   sonraki vadeyi ilerletir ve kullanıcıya bildirim gönderir.
 * - Vadesine "reminder_days_before" kadar kalan ödemeler için ön-uyarı gönderir.
 *
 * Vadesi birden fazla dönem geçmişse (sunucu kapalı kaldıysa) her dönem için ayrı
 * kayıt üretilir; böylece defterde boşluk kalmaz.
 */
@Injectable()
export class RecurringPaymentsProcessor {
  private readonly logger = new Logger(RecurringPaymentsProcessor.name);

  constructor(
    private recurringPaymentsService: RecurringPaymentsService,
    private budgetService: BudgetService,
    private notificationsService: NotificationsService
  ) {}

  @Cron("0 8 * * *")
  async processDuePayments(): Promise<void> {
    const today = toDateString(new Date());

    try {
      const due = await this.recurringPaymentsService.findDue(today);
      for (const payment of due) {
        await this.runPayment(payment, today);
      }

      const upcoming = await this.recurringPaymentsService.findUpcoming(today);
      for (const payment of upcoming) {
        const remaining = daysBetween(today, payment.nextDueDate);
        if (remaining > 0 && remaining === payment.reminderDaysBefore) {
          await this.sendReminder(payment, remaining);
        }
      }
    } catch (err) {
      this.logger.error("Düzenli ödemeler işlenirken hata oluştu", err as Error);
    }
  }

  private async runPayment(payment: RecurringPayment, today: string): Promise<void> {
    try {
      let dueDate = payment.nextDueDate;
      let created = 0;

      // Kaçırılmış dönemler için döngü; sonsuz döngüye karşı üst sınır.
      while (dueDate <= today && created < 60) {
        await this.budgetService.createRecurringTransaction(payment, dueDate);
        dueDate = advanceDueDate(dueDate, payment.interval, payment.anchorDay);
        created += 1;
      }

      if (created === 0) return;

      await this.recurringPaymentsService.markProcessed(payment.id, dueDate);

      const label = payment.type === "income" ? "Gelir" : "Ödeme";
      const suffix = created > 1 ? ` (${created} dönem birlikte işlendi)` : "";
      await this.notificationsService.notifyUser(
        payment.ownerId,
        "recurring_payment_due",
        `${label} bütçeye işlendi`,
        `${payment.description ?? "Düzenli " + label.toLowerCase()} — ${formatAmount(payment.amount)}${suffix}`,
        "/"
      );
    } catch (err) {
      this.logger.error(`Düzenli ödeme işlenemedi: ${payment.id}`, err as Error);
    }
  }

  private async sendReminder(payment: RecurringPayment, remainingDays: number): Promise<void> {
    try {
      const label = payment.type === "income" ? "Tahsilat" : "Ödeme";
      const when = remainingDays === 1 ? "yarın" : `${remainingDays} gün sonra`;
      await this.notificationsService.notifyUser(
        payment.ownerId,
        "recurring_payment_reminder",
        `${label} yaklaşıyor`,
        `${payment.description ?? "Düzenli " + label.toLowerCase()} — ${formatAmount(payment.amount)}, ${when}`,
        "/"
      );
    } catch (err) {
      this.logger.error(`Hatırlatıcı gönderilemedi: ${payment.id}`, err as Error);
    }
  }
}
