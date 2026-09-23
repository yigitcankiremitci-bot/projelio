import type { TranslationDict } from "@projelio/shared";

/**
 * Ekip Hesapları — yöneticinin ekibi için hesap açması, e-postadaki giriş
 * bağlantısının açtığı sayfa ve ilk girişte şifre belirleme penceresi.
 *
 * "Kadro" İngilizcede "staff"; departman rolleri Kadro ekranındaki
 * karşılıklarla aynı tutuldu ki iki ekranda aynı rol iki farklı adla
 * görünmesin.
 */
export const ekipHesaplari: TranslationDict = {
  // ─────────────────────────────────────────────── Liste
  "+ Hesap aç": "+ Create account",
  "yalnızca senin açtıkların": "only the ones you created",
  "Ekip hesapları şirketler için: hesap, şirketin bir departmanının kadrosuna açılır.":
    "Team accounts are for companies: the account is added to one of the company's departments.",
  "Henüz buradan hesap açılmadı. “Hesap aç” ile ekibinden birine kullanıcı adı ve şifre oluştur; kişi e-postasındaki bağlantıyla doğrudan hesabına girer.":
    "No accounts created here yet. Use “Create account” to set up a username and password for someone on your team; they sign in straight from the link in their email.",
  "{ad} için hesap açıldı": "Account created for {ad}",
  "{eposta} adresine giriş bağlantısı gönderildi. Kişi bağlantıya tıklayınca doğrudan hesabına girer.":
    "A sign-in link was sent to {eposta}. Clicking it takes them straight into their account.",
  "Hesap açıldı ama e-posta gönderilemedi. Listeden “Bağlantıyı yeniden gönder” diyebilirsin.":
    "The account was created but the email couldn't be sent. Use “Resend link” in the list.",
  "Şifre bu ekrandan çıkınca bir daha gösterilmez. Kişiye e-posta dışında bir yoldan ilet.":
    "The password won't be shown again once you leave this screen. Share it with them some way other than email.",
  "Kadroda değil": "Not on staff",
  "Giriş yaptı · {tarih}": "Signed in · {tarih}",
  "Bağlantı gönderildi · {tarih}": "Link sent · {tarih}",
  "E-posta gitmedi": "Email not sent",
  "Bağlantıyı yeniden gönder": "Resend link",
  "Bağlantı gönderilemedi": "Couldn't send the link",
  "Yeni giriş bağlantısı {eposta} adresine gönderildi. Eski bağlantı artık çalışmaz.":
    "A new sign-in link was sent to {eposta}. The old link no longer works.",
  "E-posta gönderilemedi. Birazdan tekrar dene.": "Couldn't send the email. Try again shortly.",
  "Rolü değiştirmek ya da kişiyi kadrodan çıkarmak için departmanın Ekip sekmesini kullan.":
    "To change their role or remove them from staff, use the department's Team tab.",
  "Liste yüklenemedi": "Couldn't load the list",

  // ─────────────────────────────────────────────── Form
  "Ekip hesabı aç": "Create team account",
  "Hesap, kadro kaydı ve modül yetkileri birlikte açılır; kişiye hesabına doğrudan girebileceği bir bağlantı gider.":
    "The account, staff record and module access are created together; they get a link that signs them straight in.",
  "Ad soyad *": "Full name *",
  "Ad soyad gerekli": "Full name is required",
  "E-posta *": "Email *",
  "Bu kullanıcı adı alınmış.": "This username is taken.",
  "Kullanılabilir.": "Available.",
  "Kullanıcı adı 3-30 karakter olmalı; sadece küçük harf, rakam, nokta ve alt çizgi içerebilir.":
    "Username must be 3-30 characters: lowercase letters, digits, dots and underscores only.",
  "Giriş bağlantısı bu adrese gider; kişi bu adresle giriş yapar.":
    "The sign-in link goes to this address; they sign in with it.",
  "Kadroda ve profilinde unvan olarak görünür; yetkiyi değiştirmez.":
    "Shown as their title on staff lists and their profile; doesn't change permissions.",
  "Satış temsilcisi": "Sales representative",
  "Muhasebe uzmanı": "Accountant",
  "Proje yöneticisi": "Project manager",
  "İnsan kaynakları uzmanı": "HR specialist",
  "Grafik tasarımcı": "Graphic designer",
  "Sosyal medya uzmanı": "Social media specialist",
  "Yazılım geliştirici": "Software developer",
  Stajyer: "Intern",
  Gizle: "Hide",
  "Yeni üret": "Generate",
  "Şifre e-postada YAZMAZ. Kişi bağlantıyla girer; şifreyi gerekirse sen iletirsin.":
    "The password is NOT included in the email. They sign in with the link; share the password yourself if needed.",
  "İlk girişte kendi şifresini belirlesin (önerilir)": "Ask them to set their own password on first sign-in (recommended)",
  "Departman ve rol": "Department and role",
  "Bu şirkette henüz departman yok. Önce bir departman aç; hesap bir departmanın kadrosuna eklenir.":
    "This company has no departments yet. Create one first; the account is added to a department's staff.",
  "Yalnızca yöneticisi olduğun departmanlar listeleniyor.": "Only departments you manage are listed.",
  "Departmanın modüllerini görür; işaretlediğin modüllerde kayıt girer.":
    "Sees the department's modules; can add records in the modules you tick.",
  "Departmanı yönetir: kadroya kişi ekler, tüm modüllerde kayıt girer, bütçeyi görür.":
    "Manages the department: adds staff, adds records in every module, sees the budget.",
  "Dış kaynak: yalnızca işaretlediğin modüllerde çalışır, kadroyu ve bütçeyi göremez.":
    "External: works only in the modules you tick; can't see staff or budget.",
  "Görebilecekleri ve çalışacağı modüller": "What they can see and work on",
  "Departmanın kadrosunda olmak o departmanın modüllerini görmeye yeter. İşaretlediğin modüllerde kayıt da girebilir.":
    "Being on a department's staff is enough to see its modules. In the modules you tick they can also add records.",
  Hiçbiri: "None",
  "Bu departmanda açık modül yok.": "No modules are enabled in this department.",
  "Karşılama notu": "Welcome note",
  "Aramıza hoş geldin! Pazartesi 09:00'da tanışma toplantımız var.":
    "Welcome aboard! We have an intro meeting on Monday at 9:00.",
  "İsteğe bağlı; e-postada senin adınla görünür.": "Optional; appears in the email under your name.",
  "En az bir departman seç.": "Pick at least one department.",
  "Hesap açılamadı": "Couldn't create the account",
  "Hesabı aç ve e-postayı gönder": "Create account and send email",

  // ─────────────────────────────────────────────── Giriş bağlantısı + ilk şifre
  "Hesabına giriliyor…": "Signing you in…",
  "Giriş yapılamadı": "Couldn't sign in",
  "Giriş yapılamadı.": "Couldn't sign in.",
  "Hoş geldin, {ad}": "Welcome, {ad}",
  "Hesabını yöneticin açtı. Devam etmeden önce yalnızca senin bildiğin bir şifre belirle; bundan sonra e-posta adresin ve bu şifreyle giriş yaparsın.":
    "Your manager created this account. Before you continue, set a password only you know; from now on you'll sign in with your email and this password.",
  "Yeni şifre (en az 8 karakter)": "New password (at least 8 characters)",
  "Şifre en az 8 karakter olmalı.": "Password must be at least 8 characters.",
  "Şifre kaydedilemedi.": "Couldn't save the password.",
  "Şifremi belirle ve devam et": "Set my password and continue",
};
