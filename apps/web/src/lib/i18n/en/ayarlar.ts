import type { TranslationDict } from "@projelio/shared";

/** Ayarlar sayfası ve alt kartları. */
export const ayarlar: TranslationDict = {
  // ══════════════════════════════════════════════════════ Ayarlar

  // ══════════════════════════════════════════════════════ Ayarlar
  Ayarlar: "Settings",
  Görünüm: "Appearance",
  Yardımcılar: "Helpers",
  "Çalışma ritmi": "Work rhythm",
  "Bağlı hesaplar": "Connected accounts",
  Erişilebilirlik: "Accessibility",
  "Açılış": "On startup",
  "Tehlikeli bölge": "Danger zone",
  "Hesabına bağlı sayfalar": "Pages linked to your account",

  // Dil kartı
  Dil: "Language",
  "Arayüz dili": "Interface language",
  Otomatik: "Automatic",
  "Varsayılan olarak tarayıcının dili kullanılır. Seçim yaptığında hesabına kaydedilir ve e-postalar, bildirimler ve Lio da o dile geçer.":
    "Your browser's language is used by default. Once you choose, the setting is saved to your account and your emails, notifications and Lio switch to that language too.",

  // Hesap
  "Kullanıcı adı": "Username",
  "Ekip üyesi eklerken seni bu kullanıcı adıyla arayabilirler.":
    "People can find you by this username when adding team members.",
  "Kullanıcı adı güncellendi.": "Username updated.",
  "Kullanıcı adı güncellenemedi.": "Could not update your username.",
  "Ad soyad, unvan, kısa açıklama ve profil fotoğrafın — anasayfadaki kişi kartında görünür.":
    "Your name, title, short bio and profile photo — shown on your card on the home page.",
  "WhatsApp numarası": "WhatsApp number",
  "Doğrulanmış numaran — elle yazılmaz, telefonundan gönderdiğin kodla eşleşir (Bağlı hesaplar sekmesi).":
    "Your verified number — you don't type it in; it comes from the code you send from your phone (Connected accounts tab).",
  "Hesabımı sil": "Delete my account",
  "Çıkış yap": "Sign out",
  "Arşiv": "Archive",

  // Şifre
  "Şifre değiştir": "Change password",
  "Şifre belirle": "Set a password",
  "Şifreyi değiştir": "Change password",
  "Şifreyi belirle": "Set password",
  "Mevcut şifren": "Current password",
  "Yeni şifre": "New password",
  "Yeni şifre (tekrar)": "New password (again)",
  "En az 8 karakter. Değişiklikten sonra açık oturumların kapanmaz.":
    "At least 8 characters. Changing it won't sign you out of your other sessions.",
  "Hesabın Google ile açılmış, henüz şifresi yok. Bir şifre belirlersen e-posta ve şifreyle de giriş yapabilirsin.":
    "Your account was created with Google and has no password yet. Set one and you'll be able to sign in with your email and password too.",
  "Yeni şifre en az 8 karakter olmalı.": "Your new password must be at least 8 characters.",
  "Yeni şifreler birbirini tutmuyor.": "The new passwords don't match.",
  "Şifren güncellendi.": "Your password has been updated.",
  "Şifre değiştirilemedi.": "Could not change your password.",

  // Demo
  "Demo hesabı": "Demo account",
  "Bu hesap üye olmadan gezmek isteyenler için herkese açık. Şifresi değiştirilemez, hesap silinemez ve içeride yaptığın her değişiklik bir sonraki girişte geri alınır — istediğin gibi kurcalayabilirsin.":
    "This account is open to anyone who wants to look around without signing up. Its password can't be changed, the account can't be deleted, and everything you change inside is reset at the next sign-in — so feel free to poke at it.",

  // Erişilebilirlik ve tema
  "Yazı boyutu": "Text size",
  "Görme zorluğu yaşıyorsan uygulamadaki yazıları ve arayüzü büyütebilirsin.":
    "If you have trouble reading the screen, you can enlarge the text and the interface.",
  "Geçiş ve animasyonları neredeyse tamamen kapatır. Baş dönmesi/odaklanma sorunu yaşıyorsan ya da arayüzün daha hızlı hissettirmesini istiyorsan aç.":
    "Turns off almost all transitions and animations. Switch it on if motion makes you dizzy or breaks your focus, or if you just want the interface to feel faster.",
  "Aydınlık veya karanlık görünümü seç. Tercih bu cihazda saklanır.":
    "Choose a light or dark look. The preference is stored on this device.",
  Aydınlık: "Light",
  Karanlık: "Dark",
  "Düğmelerde ve seçili öğelerde kullanılan rengi Projelio paletinden değiştir.":
    "Change the colour used on buttons and selected items, from the Projelio palette.",
  "Kenar çubuğu rengi": "Sidebar colour",
  "Soldaki menünün rengini kişiselleştir.": "Personalise the colour of the menu on the left.",
  "Kenar çubuğu deseni": "Sidebar pattern",
  "Soldaki menünün arkasına ince bir doku ekle.": "Add a subtle texture behind the menu on the left.",
  "Varsayılan": "Default",

  // Açılış tercihleri
  "Ana Sayfa düğmesi": "Home button",
  "Menüdeki Ana Sayfa düğmesine bastığında nereye gideceğini seçebilirsin. Bu tercih yalnızca bu cihazda geçerlidir.":
    "Choose where the Home button in the menu takes you. This preference applies to this device only.",
  "Kenar çubuğu açık başlasın": "Start with the sidebar open",
  "Bilgisayarda uygulamayı açtığında soldaki menü açık mı gelsin? Kapalı seçersen sol üstteki okla açarsın. Telefonda menü her zaman kapalı başlar.":
    "Should the menu on the left be open when you launch the app on a computer? If you turn this off, you open it with the arrow at the top left. On a phone the menu always starts closed.",
  "Özet sayılar açık başlasın": "Start with summary counts open",
  "İş ve rutin sayfalarındaki proje/görev sayıları kutusu (dar ekranda katlanan özet) açık mı gelsin?":
    "Should the project/task count box on job and routine pages (the summary that collapses on narrow screens) start open?",
  "Lio yardımcısı": "Lio assistant",
  "Sağ altta duran Lio balonu. Kapatırsan düğme gizlenir; Lio'yu Cmd/Ctrl + K ile yine açabilirsin.":
    "The Lio bubble in the bottom right. Turn it off and the button is hidden; you can still open Lio with Cmd/Ctrl + K.",
  "Kim bu sayfada şeridi": "\"Who's on this page\" strip",
  "Aynı sayfada çalışan ekip arkadaşlarını sol altta gösteren ince şerit.":
    "A thin strip in the bottom left showing teammates working on the same page.",
  "Kullanım turu": "Guided tour",
  "Uygulamayı tanıtan sesli turu baştan izle. Tur, bulunduğun sayfadaki öğeleri işaret ederek ilerler.":
    "Watch the narrated tour of the app from the start. It walks you through by pointing at things on the page you're on.",
  "Turu yeniden başlat": "Restart the tour",

  // Yasal
  "Kullanıcı Sözleşmesi": "Terms of Service",
  "Gizlilik Politikası": "Privacy Policy",
  "KVKK Aydınlatma Metni": "Data Protection Notice",
};
