import type { TranslationDict } from "@projelio/shared";

/**
 * Google Takvim entegrasyonu — istemciye dönen hata mesajları ve Lio'nun
 * eylem bağlantısı (bkz. modules/google-takvim).
 */
export const googleTakvim: TranslationDict = {
  "Google Takvim'e eklendi": "Added to Google Calendar",
  "Takvim izni verilmedi. Bağlarken takvim kutularını işaretli bırak.":
    "Calendar permission wasn't granted. Leave the calendar boxes checked when connecting.",
  "Google Takvim bağlı değil. Ayarlar > Bağlı hesaplar'dan bağlayabilirsin.":
    "Google Calendar isn't connected. You can connect it in Settings > Connected accounts.",
  "Google Takvim bağlantısı kopmuş. Yeniden bağlan.": "The Google Calendar connection was lost. Reconnect it.",
  "En az bir takvim seçili kalmalı.": "Keep at least one calendar selected.",
  "Bu takvime etkinlik eklenemiyor.": "Events can't be added to this calendar.",
  "Takvim listesini okuma izni verilmemiş. Bağlantıyı kesip yeniden bağlan.":
    "Permission to read your calendar list wasn't granted. Disconnect and connect again.",
  "Bu etkinlik Google Takvim'den geldi; orada düzenleyebilirsin.":
    "This event came from Google Calendar; edit it there.",
  "Bu etkinlik Google Takvim'den geldi; orada silebilirsin.": "This event came from Google Calendar; delete it there.",
  "Geçersiz işlem durumu.": "Invalid status.",
  "Etkinlik bulunamadı.": "Event not found.",
  "Google etkinliği okunamadı.": "Couldn't read the Google event.",
  "Bu takvime yazma izni yok. Ayarlar'dan başka bir hedef takvim seç.":
    "No permission to write to this calendar. Pick another target calendar in Settings.",
  "Etkinlik Google Takvim'de bulunamadı; silinmiş olabilir.": "Event not found in Google Calendar; it may have been deleted.",
  "Google Takvim'e ulaşılamadı. Biraz sonra tekrar dene.": "Couldn't reach Google Calendar. Try again shortly.",
  "Etkinliğin bir başlığı olmalı.": "The event needs a title.",
  "Başlık çok uzun.": "The title is too long.",
  "Tarih YYYY-AA-GG biçiminde olmalı.": "Date must be in YYYY-MM-DD format.",
  "Saat SS:DD biçiminde olmalı.": "Time must be in HH:MM format.",
};
