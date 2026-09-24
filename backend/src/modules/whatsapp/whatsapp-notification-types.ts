import { WHATSAPP_GIDEN_TIPLER, type NotificationPayload } from "@projelio/shared";

/**
 * Hangi bildirim tipleri WhatsApp'a da gider.
 *
 * Varsayılan KAPALI: burada listelenmeyen tip gitmez. Neden dar tutuluyor:
 * her WhatsApp mesajı günlük kotadan düşer ve ban riskini artırır; anlık
 * değeri düşük olanlar (beğeni, günlük özet, yöneticiye maliyet uyarısı)
 * uygulama içi bildirimde kalır.
 */
// Liste ortak pakette: Ayarlar'daki bildirim tercihleri kartı da aynı kümeye
// bakıp WhatsApp'a gitmeyen tip için anahtar göstermiyor.
const WHATSAPP_NOTIFICATION_TYPES = WHATSAPP_GIDEN_TIPLER;

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
