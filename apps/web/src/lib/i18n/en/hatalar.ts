import type { TranslationDict } from "@projelio/shared";

/** Kullanıcıya gösterilen hata ve uyarı metinleri. */
export const hatalar: TranslationDict = {
  // ─────────────────────────────────────────────── "… yapılamadı. Tekrar dene."
  // Aynı kalıbın kayıt türüne göre çeşitleri. Tek bir yer tutuculu metne
  // indirilmedi çünkü İngilizcede "the job/project/output" öncesi belirteç
  // ve sözcük sırası kayda göre değişebiliyor; ayrı anahtarlar daha güvenli.
  "İş oluşturulamadı. Tekrar dene.": "Could not create the job. Try again.",
  "İş güncellenemedi. Tekrar dene.": "Could not update the job. Try again.",
  "Proje oluşturulamadı. Tekrar dene.": "Could not create the project. Try again.",
  "Proje güncellenemedi. Tekrar dene.": "Could not update the project. Try again.",
  "Görev oluşturulamadı. Tekrar dene.": "Could not create the task. Try again.",
  "Görev silinemedi. Tekrar dene.": "Could not delete the task. Try again.",
  "Çıktı oluşturulamadı. Tekrar dene.": "Could not create the output. Try again.",
  "Çıktı güncellenemedi. Tekrar dene.": "Could not update the output. Try again.",
  "Rutin oluşturulamadı. Tekrar dene.": "Could not create the routine. Try again.",
  "Rutin güncellenemedi. Tekrar dene.": "Could not update the routine. Try again.",
  "Grup oluşturulamadı. Tekrar dene.": "Could not create the group. Try again.",
  "Grup güncellenemedi. Tekrar dene.": "Could not update the group. Try again.",
  "Organizasyon oluşturulamadı. Tekrar dene.": "Could not create the organization. Try again.",
  "Organizasyon güncellenemedi. Tekrar dene.": "Could not update the organization. Try again.",
  "Profil güncellenemedi. Tekrar dene.": "Could not update your profile. Try again.",
  "Deadline güncellenemedi. Tekrar dene.": "Could not update the deadline. Try again.",
  "İşlem gerçekleştirilemedi. Tekrar dene.": "Could not complete the operation. Try again.",
  "Sohbet yüklenemedi.": "Could not load the conversation.",
  "Çalışma ritmi ayarları yüklenemedi.": "Could not load the work rhythm settings.",

  // Doğrulama
  "En az bir departman seç ya da özel bir isim gir": "Pick at least one department or enter a custom name",
  "En az bir modül seç": "Pick at least one module",
  "Geçerli bir tutar gir": "Enter a valid amount",
  "Bir kullanıcı seç": "Pick a user",
  "Bitiş tarihi başlangıç tarihinden önce olamaz.": "The end date can't be before the start date.",

  // Ses kaydı
  "Bu tarayıcı ses kaydını desteklemiyor.": "This browser doesn't support audio recording.",
  "Kayıt çok kısa, bir şey duyamadım.": "The recording was too short — I couldn't hear anything.",

  // Bulut bağlantıları
  "Google entegrasyonu sunucuda yapılandırılmamış.": "The Google integration isn't configured on the server.",
  "OneDrive entegrasyonu sunucuda yapılandırılmamış.": "The OneDrive integration isn't configured on the server.",
  "Zaten Google Drive bağlısınız. Değiştirmek için önce Drive bağlantısını kaldırın.":
    "Google Drive is already connected. Disconnect it first if you want to change it.",
  "Zaten OneDrive bağlısınız. Değiştirmek için önce OneDrive bağlantısını kaldırın.":
    "OneDrive is already connected. Disconnect it first if you want to change it.",
  "Bağlı bir Google Drive ya da OneDrive hesabın yok. Ayarlardan bir hesap bağlayabilirsin.":
    "You don't have a Google Drive or OneDrive account connected. You can connect one in Settings.",
  "Kapak yüklenemedi. Tekrar dene.": "Could not upload the cover. Try again.",
  "Kapak kaldırılamadı. Tekrar dene.": "Could not remove the cover. Try again.",
};
