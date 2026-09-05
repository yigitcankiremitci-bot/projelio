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

      // Başlık ve gövde AYRI anahtarlar: "Gelir"/"Ödeme" sözcüğünü cümlenin
      // içine gömmek İngilizcede işlemiyor (sözcük sırası ve büyük harf farklı),
      // bu yüzden gelir ve gider için ayrı metinler var.
      const gelir = payment.type === "income";
      const tutar = formatAmount(payment.amount);
      // Açıklama yoksa metnin KENDİSİ değişiyor. Yedek sözcüğü parametre
      // olarak geçmek İngilizce cümlenin ortasında Türkçe bırakırdı: params
      // çevrilmiyor, yalnızca kalıp çevriliyor.
      const aciklama = payment.description;
      await this.notificationsService.notifyUser(
        payment.ownerId,
        "recurring_payment_due",
        gelir ? "Gelir bütçeye işlendi" : "Ödeme bütçeye işlendi",
        aciklama
          ? created > 1
            ? { metin: "{aciklama} — {tutar} ({n} dönem birlikte işlendi)", params: { aciklama, tutar, n: created } }
            : { metin: "{aciklama} — {tutar}", params: { aciklama, tutar } }
          : created > 1
          ? gelir
            ? { metin: "Düzenli gelir — {tutar} ({n} dönem birlikte işlendi)", params: { tutar, n: created } }
            : { metin: "Düzenli ödeme — {tutar} ({n} dönem birlikte işlendi)", params: { tutar, n: created } }
          : gelir
          ? { metin: "Düzenli gelir — {tutar}", params: { tutar } }
          : { metin: "Düzenli ödeme — {tutar}", params: { tutar } },
        "/"
      );
    } catch (err) {
      this.logger.error(`Düzenli ödeme işlenemedi: ${payment.id}`, err as Error);
    }
  }

  private async sendReminder(payment: RecurringPayment, remainingDays: number): Promise<void> {
    try {
      const tahsilat = payment.type === "income";
      const tutar = formatAmount(payment.amount);
      const aciklama = payment.description;
      await this.notificationsService.notifyUser(
        payment.ownerId,
        "recurring_payment_reminder",
        tahsilat ? "Tahsilat yaklaşıyor" : "Ödeme yaklaşıyor",
        // "yarın" ile "{n} gün sonra" ayrı anahtarlar: İngilizcede gün sayısı
        // çoğul eki gerektiriyor ve "tomorrow" hiç sayı içermiyor.
        aciklama
          ? remainingDays === 1
            ? { metin: "{aciklama} — {tutar}, yarın", params: { aciklama, tutar } }
            : { metin: "{aciklama} — {tutar}, {n} gün sonra", params: { aciklama, tutar, n: remainingDays } }
          : remainingDays === 1
          ? tahsilat
            ? { metin: "Düzenli tahsilat — {tutar}, yarın", params: { tutar } }
            : { metin: "Düzenli ödeme — {tutar}, yarın", params: { tutar } }
          : tahsilat
          ? { metin: "Düzenli tahsilat — {tutar}, {n} gün sonra", params: { tutar, n: remainingDays } }
          : { metin: "Düzenli ödeme — {tutar}, {n} gün sonra", params: { tutar, n: remainingDays } },
        "/"
      );
    } catch (err) {
      this.logger.error(`Hatırlatıcı gönderilemedi: ${payment.id}`, err as Error);
    }
  }
}
