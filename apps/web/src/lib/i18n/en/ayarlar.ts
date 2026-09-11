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

  // ─────────────────────────────────────────────── Bulut depolama hesapları
  "Bulut depolama hesapları": "Cloud storage accounts",
  "Dosyalar kendi Drive/OneDrive hesabınızda saklanır. Birden fazla hesap bağlayıp şirketlerinizi ayrı hesaplarda tutabilirsiniz.":
    "Files are stored in your own Drive/OneDrive account. Connect more than one account to keep your companies separate.",
  "Dosya ekleyebilmek için önce bir bulut hesabı bağlayın.":
    "Connect a cloud account before you can add files.",
  "Google Drive hesabı bağla": "Connect a Google Drive account",
  "OneDrive hesabı bağla": "Connect a OneDrive account",
  "Bu hesaba bir ad verin (örn. Şirket Drive'ı):": "Name this account (e.g. Company Drive):",
  "Örn. Şirket Drive'ı": "e.g. Company Drive",
  "Ad ver": "Name it",
  "Ad kaydedilemedi.": "The name couldn't be saved.",
  "Bağlantı başlatılamadı.": "The connection couldn't be started.",
  "Bağlantı kaldırılamadı.": "The connection couldn't be removed.",
  "Bu sağlayıcı sunucuda yapılandırılmamış.": "This provider isn't configured on the server.",
  // Hesap satırının altındaki durum yazısı; cümle ortasında geçtiği için küçük harf.
  "dosya erişimi hazır": "file access ready",
  "erişim sona ermiş, yeniden bağlayın": "access expired, reconnect",
  "yalnızca giriş için bağlı": "connected for sign-in only",
  "giriş hesabı": "sign-in account",
  "Projelio'nun bu hesaptaki dosya erişimi kaldırılacak. Dosyalarınız yerinde kalır ama Projelio içinden açılamaz. Bu hesapla girişe devam edebilirsiniz.":
    "Projelio's file access to this account will be removed. Your files stay where they are but can't be opened from Projelio. You can still sign in with this account.",
  "Bu hesabın bağlantısı tamamen kaldırılacak. Hesapta saklanan Projelio dosyası varsa önce ilgili şirket için başka bir depo hesabı seçmeniz gerekir.":
    "This account will be disconnected completely. If it still stores Projelio files, choose another storage account for the company first.",

  // ══════════════════════════════════════════════════════ Bildirim e-postaları
  "Bildirim e-postaları": "Notification emails",
  "Bildirimlerin e-posta olarak da gelsin — sıklığını ve saatini sen seç.":
    "Get your notifications by email too — you choose how often and when.",
  "Her bildirimde": "Every notification",
  "Bildirim oluştukça gelir. Arka arkaya gelenler tek e-postada toplanır.":
    "Sent as notifications happen. Ones arriving close together are bundled into a single email.",
  "Günde bir özet": "One summary a day",
  "Seçtiğin saatte, o güne ait her şey tek e-postada.":
    "Everything from that day in one email, at the hour you pick.",
  "Hiç e-posta gönderilmez. Bildirimler uygulamada görünmeye devam eder.":
    "No emails at all. Notifications still show up in the app.",
  "Her gün saat": "Every day at",
  "({zamanDilimi} saatiyle)": "({zamanDilimi} time)",
  "O gün biten görevlerim de listelensin": "Also list my tasks due that day",
  "Deneme e-postası gönder": "Send a test email",
  "Gönderiliyor…": "Sending…",
  "Kurulumun çalıştığını hemen görmek için.": "To see right away that it works.",
  "Deneme e-postası gönderildi. Birkaç dakika içinde gelmezse spam klasörüne bak.":
    "Test email sent. If it doesn't arrive within a few minutes, check your spam folder.",
  "Deneme e-postası gönderilemedi. E-posta adresin doğrulanmamış olabilir.":
    "The test email couldn't be sent. Your email address may not be verified.",
  "Deneme e-postası gönderilemedi.": "The test email couldn't be sent.",
  "Bildirim e-postası ayarları yüklenemedi.": "Notification email settings couldn't be loaded.",
  "Ayar kaydedilemedi.": "The setting couldn't be saved.",
};
