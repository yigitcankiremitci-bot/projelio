import type { TranslationDict } from "@projelio/shared";

/**
 * Google Takvim entegrasyonu — Ayarlar kartı, takvim sayfasındaki etkinlikler
 * ve etkinlik penceresi (bkz. components/googleTakvim).
 *
 * "Google Calendar" ürünün kendi adı; çevrilmeden özel ad olarak kalır.
 */
export const googleTakvim: TranslationDict = {
  // ─────────────────────────────────────────────── Ayarlar kartı
  "Google Takvim": "Google Calendar",
  "Toplantıların Projelio takviminde görünsün, planın Google Takvim'e gitsin":
    "See your meetings in Projelio's calendar and send your plan to Google Calendar",
  "Bağladığında takvimindeki etkinlikler Projelio takviminde görünür; zaman bloklarını Google Takvim'e ekleyebilir, Lio'dan etkinliklerini göreve çevirmesini isteyebilirsin.":
    "Once connected, your calendar events show up in Projelio's calendar; you can add time blocks to Google Calendar and ask Lio to turn events into tasks.",
  "Google Takvim'i bağla": "Connect Google Calendar",
  "Google Takvim'i yeniden bağla": "Reconnect Google Calendar",
  "Google Takvim durumu alınamadı.": "Couldn't load Google Calendar status.",
  "Google'a yönlendirilemedi.": "Couldn't redirect to Google.",
  "Bağlı hesap:": "Connected account:",
  "Google bu bağlantının erişimini kaldırmış. Etkinliklerin güncellenmesi için yeniden bağlan.":
    "Google revoked this connection's access. Reconnect to keep your events up to date.",
  "Yeniden bağlan": "Reconnect",
  "Gösterilen takvimler": "Calendars shown",
  "(birincil)": "(primary)",
  "Projelio'dan eklenenler şu takvime yazılsın": "Add events from Projelio to this calendar",
  "Son eşitleme:": "Last synced:",
  "Henüz eşitlenmedi.": "Not synced yet.",
  "Şimdi eşitle": "Sync now",
  "Takvim listesini yenile": "Refresh calendar list",
  "Google Takvim bağlantısı kesilsin mi? Projelio'dan eklediğin etkinlikler Google Takvim'de kalır.":
    "Disconnect Google Calendar? Events you added from Projelio will stay in Google Calendar.",
  "Google Takvim bağlantısı kopmuş. Yeniden bağlan.": "The Google Calendar connection was lost. Reconnect it.",

  // ─────────────────────────────────────────────── Takvim sayfası
  "+ Etkinlik": "+ Event",
  "Etkinlikleri Lio ile işle": "Process events with Lio",
  "+{n} etkinlik": { one: "+{n} event", other: "+{n} events" },
  Google: "Google",
  "Google Takvim'e de ekle": "Also add to Google Calendar",
  "Blok kaydedildi ama Google Takvim'e aktarılamadı:": "Block saved, but couldn't be sent to Google Calendar:",

  // ─────────────────────────────────────────────── Etkinlik penceresi
  "Projelio'dan eklendi": "Added from Projelio",
  "Düzenleyen:": "Organizer:",
  "{n} katılımcı": { one: "{n} guest", other: "{n} guests" },
  "Toplantıya katıl": "Join meeting",
  "Google Takvim'de aç": "Open in Google Calendar",
  "Projelio'ya görev olarak işlendi": "Added to Projelio as a task",
  "Görev olmayacak diye işaretlendi.": "Marked as not a task.",
  "Bu etkinlik henüz Projelio'ya işlenmedi. Lio hangi işe ait olduğunu ve ne kadar süreceğini tahmin edip görev önerebilir.":
    "This event isn't in Projelio yet. Lio can guess which job it belongs to and how long it'll take, and suggest a task.",
  "Etkinlik Google Takvim'den de silinsin mi?": "Delete this event from Google Calendar too?",
  "Görev değil": "Not a task",
  "Lio ile göreve çevir": "Turn into a task with Lio",
  "İşareti kaldır": "Clear mark",
  "Etkinliği düzenle": "Edit event",
  "Google Takvim'e etkinlik ekle": "Add event to Google Calendar",
  "Tüm gün": "All day",
  "İlk gün": "First day",
  "Son gün": "Last day",
  "Tarih seç.": "Pick a date.",
  "Etkinliğin bir başlığı olmalı.": "The event needs a title.",
  "Etkinlik Ayarlar'da seçtiğin Google takvimine yazılır. Davetli eklenmez, kimseye e-posta gitmez.":
    "The event goes to the Google calendar you picked in Settings. No guests are added and no emails are sent.",
};
