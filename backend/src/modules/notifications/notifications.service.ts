import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import * as webpush from "web-push";
import type { NotificationPayload, PushSubscriptionPayload } from "@projelio/shared";
import { SupabaseService } from "../../database/supabase.service";
import { NotificationsGateway } from "./notifications.gateway";
import { WhatsappService } from "../whatsapp/whatsapp.service";

function mapNotification(row: any): NotificationPayload {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link ?? undefined,
    createdAt: row.created_at,
    read: row.read,
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly vapidConfigured: boolean;

  constructor(
    private supabase: SupabaseService,
    private gateway: NotificationsGateway,
    // forwardRef: WhatsApp modülü bağlantı durumunu tarayıcıya iletmek için bu
    // modülün gateway'ini kullanıyor; biz de bildirimi WhatsApp'a vermek için
    // onu — iki yönlü bağımlılık Nest'te ancak böyle çözülüyor.
    @Inject(forwardRef(() => WhatsappService)) private whatsapp: WhatsappService
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:destek@projelio.app";
    this.vapidConfigured = Boolean(publicKey && privateKey);
    if (this.vapidConfigured) {
      webpush.setVapidDetails(subject, publicKey!, privateKey!);
    } else {
      this.logger.warn("VAPID anahtarları tanımlı değil, push bildirimleri gönderilemeyecek.");
    }
  }

  // Bildirim oluşturur: veritabanına yazar, açık soketlere anlık iletir, push abonelerine gönderir.
  async notifyUser(
    userId: string,
    type: NotificationPayload["type"],
    title: string,
    body: string,
    link?: string
  ): Promise<NotificationPayload> {
    const { data: row, error } = await this.supabase.client
      .from("notifications")
      .insert({ user_id: userId, type, title, body, link: link ?? null })
      .select()
      .single();
    if (error) throw error;

    const notification = mapNotification(row);
    this.gateway.sendToUser(userId, notification);
    void this.sendPush(userId, notification);
    // Dördüncü kanal: kullanıcı WhatsApp'a bağlıysa kuyruğa girer, değilse
    // sessizce döner. Gönderim burada değil, dakikalık işleyicide (hız sınırı).
    void this.whatsapp.notifyUser(userId, notification);
    return notification;
  }

  async findForUser(userId: string, limit = 50): Promise<{ notifications: NotificationPayload[]; unreadCount: number }> {
    const { data, error } = await this.supabase.client
      .from("notifications")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    const notifications = (data ?? []).map(mapNotification);
    const unreadCount = notifications.filter((n) => !n.read).length;
    return { notifications, unreadCount };
  }

  async markRead(id: string, userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("notifications")
      .update({ read: true })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw error;
  }

  async markAllRead(userId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);
    if (error) throw error;
  }

  broadcastActiveWorker(userId: string, activeTaskId: string | null): void {
    this.gateway.broadcastActiveWorker(userId, activeTaskId);
  }

  getVapidPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY ?? "";
  }

  async saveSubscription(userId: string, subscription: PushSubscriptionPayload): Promise<void> {
    const { error } = await this.supabase.client.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      { onConflict: "endpoint" }
    );
    if (error) throw error;
  }

  async removeSubscription(endpoint: string): Promise<void> {
    const { error } = await this.supabase.client.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  }

  private async sendPush(userId: string, notification: NotificationPayload): Promise<void> {
    if (!this.vapidConfigured) return;
    const { data, error } = await this.supabase.client
      .from("push_subscriptions")
      .select()
      .eq("user_id", userId);
    if (error || !data || data.length === 0) return;

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      link: notification.link ?? "/",
    });

    await Promise.all(
      data.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await this.removeSubscription(sub.endpoint);
          } else {
            this.logger.warn(`Push gönderilemedi (${sub.endpoint}): ${err?.message ?? err}`);
          }
        }
      })
    );
  }
}
