import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsService } from "./notifications.service";

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/**
 * Her gün sabah 09:00'da "günün işleri", her Pazartesi 08:30'da "haftanın işleri"
 * özetini görevi kendine atanmış her ekip üyesine bildirim olarak gönderir.
 */
@Injectable()
export class DigestProcessor {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(
    private supabase: SupabaseService,
    private notificationsService: NotificationsService
  ) {}

  // Her gün 09:00 (sunucu saatiyle)
  @Cron("0 9 * * *")
  async sendDailyDigest() {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    await this.sendDigestForRange(today, tomorrow, "daily_digest", "Bugünün işleri");
  }

  // Her Pazartesi 08:30 (sunucu saatiyle)
  @Cron("30 8 * * 1")
  async sendWeeklyDigest() {
    const today = startOfDay(new Date());
    const weekEnd = addDays(today, 7);
    await this.sendDigestForRange(today, weekEnd, "weekly_digest", "Bu haftanın işleri");
  }

  private async sendDigestForRange(from: Date, to: Date, type: "daily_digest" | "weekly_digest", title: string) {
    const { data, error } = await this.supabase.client
      .from("tasks")
      .select("id, title, assigned_to, deadline, status")
      .not("assigned_to", "is", null)
      .neq("status", "completed")
      .gte("deadline", from.toISOString())
      .lt("deadline", to.toISOString());

    if (error) {
      this.logger.error(`Özet bildirimi için görevler alınamadı: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) return;

    const tasksByUser = new Map<string, string[]>();
    for (const task of data) {
      const list = tasksByUser.get(task.assigned_to) ?? [];
      list.push(task.title);
      tasksByUser.set(task.assigned_to, list);
    }

    await Promise.all(
      Array.from(tasksByUser.entries()).map(([userId, titles]) => {
        const preview = titles.slice(0, 5).join(", ");
        const extra = titles.length > 5 ? ` ve ${titles.length - 5} görev daha` : "";
        const body = `${titles.length} göreviniz var: ${preview}${extra}`;
        return this.notificationsService.notifyUser(userId, type, title, body, "/tasks");
      })
    );
  }
}
