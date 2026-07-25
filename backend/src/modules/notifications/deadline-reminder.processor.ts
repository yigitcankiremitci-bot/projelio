import { Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { NotificationsService } from "./notifications.service";

/**
 * BullMQ + Redis ile ağır işleyişte kuyruklanacak, burada basitçe
 * CRON tabanlı kontrol örneği: görev/proje deadline'larına 24 saat / 1 saat
 * kala otomatik bildirim gönderir.
 */
@Injectable()
export class DeadlineReminderProcessor {
  constructor(private notificationsService: NotificationsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkUpcomingDeadlines() {
    // TODO: tasks/projects tablosundan deadline'ı 24h veya 1h içinde olanları çek
    // this.notificationsService.notifyUser(userId, "task_due_24h", ...)
  }
}
