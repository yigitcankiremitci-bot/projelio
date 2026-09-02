import type { NotificationPayload } from "@projelio/shared";

/**
 * Hangi bildirim tipleri WhatsApp'a da gider.
 *
 * Varsayılan KAPALI: burada listelenmeyen tip gitmez. Neden dar tutuluyor:
 * her WhatsApp mesajı günlük kotadan düşer ve ban riskini artırır; anlık
 * değeri düşük olanlar (beğeni, günlük özet, yöneticiye maliyet uyarısı)
 * uygulama içi bildirimde kalır.
 */
const WHATSAPP_NOTIFICATION_TYPES: ReadonlySet<NotificationPayload["type"]> = new Set<NotificationPayload["type"]>([
  "task_due_24h",
  "task_due_1h",
  "task_reminder",
  "project_deadline_24h",
  "task_assigned",
  "team_invite",
  "job_invite",
  "job_invite_answered",
  "creation_request",
  "creation_request_answered",
  "post_mention",
  "post_comment",
  "support_reply",
]);

export function shouldSendOverWhatsapp(type: NotificationPayload["type"]): boolean {
  return WHATSAPP_NOTIFICATION_TYPES.has(type);
}

/**
 * Bildirimi WhatsApp metnine çevirir. Başlık kalın, gövde altında, varsa
 * mutlak bağlantı en sonda. Tip başına özel metin yok (MVP).
 */
export function formatNotificationText(
  notification: Pick<NotificationPayload, "title" | "body" | "link">,
  webAppUrl: string | undefined
): string {
  const lines = [`*${notification.title}*`, notification.body];
  if (notification.link && webAppUrl) {
    const base = webAppUrl.replace(/\/+$/, "");
    const path = notification.link.startsWith("/") ? notification.link : "/" + notification.link;
    lines.push("", base + path);
  }
  return lines.join("\n");
}
