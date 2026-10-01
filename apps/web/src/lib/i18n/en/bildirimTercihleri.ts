import type { TranslationDict } from "@projelio/shared";

/** Ayarlar > Bildirimler: tip × kanal tercihleri (bkz. shared/bildirimTercihleri.ts). */
export const bildirimTercihleri: TranslationDict = {
  // Kanallar
  Uygulamada: "In the app",
  "Telefon ve tarayıcı": "Phone and browser",

  // Durum düğmeleri
  Bazıları: "Some",
  "Her zaman": "Always",
  "Tek tek seç": "Choose one by one",
  "Ayrıntıları gizle": "Hide details",

  // Bu cihaz
  "Telefon bildirimleri açık. Sesi ve titreşimi telefonunun Ayarlar > Uygulamalar > Projelio > Bildirimler bölümünden değiştirebilirsin.":
    "Phone notifications are on. You can change the sound and vibration in your phone's Settings > Apps > Projelio > Notifications.",
  "Bu tarayıcıya bildirim gönderilebiliyor. Sekme kapalıyken de gelir.":
    "This browser can receive notifications, even when the tab is closed.",
  "Bu tarayıcıda bildirimler engellenmiş. Adres çubuğundaki kilit simgesinden Projelio için bildirimlere izin ver.":
    "Notifications are blocked in this browser. Allow them for Projelio from the lock icon in the address bar.",
  "Bu tarayıcıya henüz bildirim izni verilmedi. Sekme kapalıyken haber alamazsın.":
    "This browser hasn't been allowed to show notifications yet. You won't hear from us while the tab is closed.",
  "Bu tarayıcı sistem bildirimlerini desteklemiyor; bildirimler uygulamada ve e-postada görünür.":
    "This browser doesn't support system notifications; you'll see them in the app and by email.",
  "Bildirim sesi": "Notification sound",
  "Uygulama açıkken yeni bildirim geldiğinde çalar.": "Plays when a new notification arrives while the app is open.",
  Dinle: "Listen",
  "Bildirim ayarların yüklenemedi. Değişiklik yaparsan kaydedilmeyi dener.":
    "Couldn't load your notification settings. If you make a change, it will try to save it.",
  "Ayar kaydedilemedi. Tekrar dene.": "Couldn't save the setting. Try again.",

  // Kategoriler
  "Görevler ve hatırlatmalar": "Tasks and reminders",
  "Sana atanan görevler, değişiklikler ve bitiş saati hatırlatmaları.":
    "Tasks assigned to you, changes and due-time reminders.",
  "Kurduğun hatırlatmalar": "Reminders you set",
  "Bana görev atandığında": "When a task is assigned to me",
  "Görevim güncellendiğinde": "When my task is updated",
  "Görev bitimine 24 saat kala": "24 hours before a task is due",
  "Görev bitimine 1 saat kala": "1 hour before a task is due",
  "Proje bitimine 24 saat kala": "24 hours before a project is due",

  "Ekip ve davetler": "Team and invitations",
  "Davetler, katılım istekleri, rol değişiklikleri ve onay talepleri.":
    "Invitations, join requests, role changes and approval requests.",
  "Bir işe davet edildiğimde": "When I'm invited to a job",
  "Bir ekibe davet edildiğimde": "When I'm invited to a team",
  "Davetim yanıtlandığında": "When my invitation is answered",
  "Katılım isteği geldiğinde": "When someone asks to join",
  "Yeni üye katıldığında": "When a new member joins",
  "Rolüm değiştiğinde": "When my role changes",
  "Onay talebi geldiğinde": "When an approval request comes in",
  "Talebim yanıtlandığında": "When my request is answered",

  "Paylaşımlar ve yorumlar": "Posts and comments",
  "Akıştaki etiketlemeler, yorumlar ve beğeniler.": "Mentions, comments and likes in the feed.",
  Etiketlendiğimde: "When I'm mentioned",
  "Paylaşımıma yorum yapıldığında": "When someone comments on my post",
  "Paylaşımım beğenildiğinde": "When someone likes my post",
  "Yorumum beğenildiğinde": "When someone likes my comment",

  "Arkadaşlık istekleri ve duvarına yazılanlar.": "Friend requests and posts on your wall.",
  "Arkadaşlık isteği geldiğinde": "When I get a friend request",
  "İsteğim kabul edildiğinde": "When my request is accepted",
  "Duvarıma yazıldığında": "When someone posts on my wall",

  "Bütçe ve ödemeler": "Budget and payments",
  "Bütçe değişiklikleri ve düzenli ödemelerin vadeleri.": "Budget changes and recurring payment due dates.",
  "Bütçe değiştiğinde": "When a budget changes",
  "Düzenli ödeme yaklaştığında": "When a recurring payment is coming up",
  "Düzenli ödemenin vadesi geldiğinde": "When a recurring payment is due",

  "Sana bağlanan dosyalar ve paylaştığın bağlantıların indirilmesi.":
    "Files linked to you and downloads of links you've shared.",
  "Bana dosya bağlandığında": "When a file is linked to me",
  "Paylaştığım dosya indirildiğinde": "When a file I shared is downloaded",

  "Sosyal medya ve WhatsApp": "Social media and WhatsApp",
  "Zamanlanmış paylaşımların sonucu ve müşterilerden gelen WhatsApp mesajları.":
    "Results of scheduled posts and WhatsApp messages from customers.",
  "Paylaşım yayımlandığında": "When a post is published",
  "Paylaşım yayımlanamadığında": "When a post fails to publish",
  "Müşteriden WhatsApp mesajı geldiğinde": "When a customer sends a WhatsApp message",

  "Destek ve duyurular": "Support and announcements",
  "Destek yanıtları ve Projelio ekibinden gelen mesajlar. Uygulamada her zaman görünür.":
    "Support replies and messages from the Projelio team. Always shown in the app.",
  "Destek talebim yanıtlandığında": "When my support request is answered",
  "Projelio ekibinden mesaj": "Message from the Projelio team",

  // Admin > Bildirim sesi (ses denemesi)
  "Bildirim sesi denemesi": "Notification sound test",
  "Mevcut ses (1.2.0)": "Current sound (1.2.0)",
  "Ses 2": "Sound 2",
  "Ses 3": "Sound 3",
  "Ses 4 (1 oktav tiz)": "Sound 4 (1 octave up)",
  "Ses 5 (2 oktav tiz)": "Sound 5 (2 octaves up)",
  "Ses 10": "Sound 10",
  "Ses 11": "Sound 11",
  "Ses 12": "Sound 12",
  "Ses 13": "Sound 13",
  "Ses 14": "Sound 14",
  "Ses 15": "Sound 15",
  "Ses 16": "Sound 16",
  "Aday ses": "Candidate sound",
  Gecikme: "Delay",
  Hemen: "Now",
  "{n} sn": "{n}s",
  "Bildirim olarak gönder": "Send as notification",
  "Hemen dinle": "Play now",
  "Ses çalınamadı.": "Couldn't play the sound.",
  "Bildirim gönderildi.": "Notification sent.",
  "Bildirim {n} saniye sonra gelecek — ekranı kilitleyebilirsin.": "The notification will arrive in {n} seconds — you can lock the screen.",
  "Deneme kanalları silindi.": "Test channels removed.",
  "Deneme kanallarını sil": "Remove test channels",
  "Aday sesleri telefonda gerçek bildirim olarak dinleyip karşılaştır. Seçim kimsenin bildirim sesini değiştirmez; kazanan ses bir sonraki uygulama sürümüne konacak.":
    "Compare the candidate sounds as real notifications on a phone. Choosing one doesn't change anyone's notification sound; the winner will ship in the next app version.",
  "Tarayıcıdasın: sesler yalnızca bilgisayarda dinlenebilir. Patlama sorunu telefonda olduğu için asıl denemeyi Android uygulamasından (1.4.0 ve üstü) yap.":
    "You're in a browser: sounds can only be played on this computer. The distortion happens on phones, so do the real test in the Android app (1.4.0 or later).",
  "Bu uygulama sürümünde ses denemesi yok. 1.4.0 ve üstünü kur.": "This app version has no sound test. Install 1.4.0 or later.",
  "Her ses telefonda kendi bildirim kanalında çalar (Android kanal sesini sonradan değiştirmiyor). Karar verince deneme kanallarını telefon ayarlarından kaldırabilirsin.":
    "Each sound plays on its own notification channel (Android can't change a channel's sound later). Once you decide, you can remove the test channels from the phone's settings.",
};
