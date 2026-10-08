import type { TranslationDict } from "@projelio/shared";

/** Proje takvimi — istemciye dönen hata mesajları ve bildirimler (bkz. modules/calendar). */
export const projeTakvimi: TranslationDict = {
  "Etkinlik adı boş olamaz": "Event name can't be empty",
  "Etkinlik adı çok uzun": "Event name is too long",
  "Etkinlik bulunamadı": "Event not found",
  "Etkinlik en fazla 60 gün sürebilir": "An event can last at most 60 days",
  "Etkinlik tarihi gerekli": "Event date is required",
  "Geçersiz etkinlik türü": "Invalid event type",
  "Geçersiz katılımcı listesi": "Invalid participant list",
  "Geçersiz renk": "Invalid color",
  "Geçersiz tarih": "Invalid date",
  "Geçersiz tarih aralığı": "Invalid date range",
  "Tarih aralığı çok geniş": "Date range is too wide",
  "Katılımcılar projenin ekibinden seçilmeli": "Participants must be chosen from the project team",
  "Çok fazla katılımcı": "Too many participants",
  "Konum çok uzun": "Location is too long",
  "Not çok uzun": "Note is too long",
  "Başlangıç ve bitiş saati gerekli": "Start and end time are required",
  "Bitiş günü başlangıçtan önce olamaz": "End day can't be before the start day",
  "Bitiş saati başlangıçtan sonra olmalı": "End time must be after the start time",
  "Bu etkinliği yalnızca ekleyen kişi ya da proje sahibi değiştirebilir":
    "Only the person who added this event or the project owner can change it",
  "Proje takvimine eklendin: {baslik}": "You were added to a project calendar event: {baslik}",
  "Proje: {proje} · {zaman}": "Project: {proje} · {zaman}",
  Teslim: "Delivery",
};
