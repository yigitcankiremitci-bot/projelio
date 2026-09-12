import type { TranslationDict } from "@projelio/shared";

/**
 * Hesaplar modülü — hesap listesi, giriş bilgileri, kilit, paylaşım ve
 * geçiş anahtarları.
 *
 * SUNUCU MESAJLARI DA BURADA: bu modülün hata cümleleri kullanıcıya doğrudan
 * gösteriliyor ("bütçe yetkisi gerekiyor", "kilit süresi doldu") ve çoğu bir
 * SONRAKİ ADIMI söylüyor. Yarısı Türkçe kalan bir akış, kullanıcıyı tam da
 * takıldığı yerde bırakırdı.
 *
 * "Geçiş anahtarı" = passkey. Türkçe karşılık Apple ve Google'ın kullandığı
 * terim; İngilizce tarafta sektörün kendi kelimesi olan "passkey" yazıyor.
 */
export const hesaplar: TranslationDict = {
  // ─────────────────────────────────────────────── Liste ve özet
  "{n} hesap": "{n} accounts",
  aylık: "monthly",
  "kasa: {kasa}": "ledger: {kasa}",
  Ara: "Search",
  "Tüm kategoriler": "All categories",
  "Giriş adreslerini aç ({n})": "Open login pages ({n})",
  "Adresi olan hesapların giriş sayfalarını açar": "Opens the login pages of accounts that have an address",
  "Tümünü paylaş": "Share all",
  "Hesap ekle": "Add account",
  "Hesabı düzenle": "Edit account",
  "Hesaplar yüklenemedi": "Couldn't load accounts",
  "Hesap silinemedi": "Couldn't delete the account",
  "Süzgece uyan hesap yok.": "No account matches the filter.",
  "Henüz hesap eklenmemiş. Üye olduğunuz yazılım, bulut, banka ve kurum hesaplarını buraya ekleyin.":
    "No accounts yet. Add the software, cloud, bank and government accounts you're signed up for.",
  "“{ad}” hesabı ve kayıtlı tüm giriş bilgileri silinsin mi? Geri getirilemez.":
    "Delete “{ad}” and every login saved for it? This can't be undone.",
  "Sunucuda şifreleme anahtarı tanımlı değil: giriş bilgileri kaydedilemez. Sistem yöneticinize bildirin.":
    "No encryption key is configured on the server: logins can't be saved. Tell your system administrator.",
  "Tarayıcı sekmeleri engelledi. Adresleri tek tek açabilirsiniz ya da bu siteye açılır pencere izni verebilirsiniz.":
    "The browser blocked the tabs. Open the addresses one by one, or allow pop-ups for this site.",
  "giriş bilgisi girilmemiş": "no login saved",
  "sıradaki ödeme {tarih}": "next payment {tarih}",
  "kasaya bağlı değil": "not linked to the ledger",
  "Sorumlu: {kisi}": "Owner: {kisi}",

  // ─────────────────────────────────────────────── Kategoriler
  Yazılım: "Software",
  "Bulut / depolama": "Cloud / storage",
  "Sosyal medya": "Social media",
  "Banka / finans": "Bank / finance",
  "Resmi kurum": "Government",
  Pazaryeri: "Marketplace",
  "Kargo / lojistik": "Shipping / logistics",

  // ─────────────────────────────────────────────── Giriş yöntemleri
  "Kullanıcı adı + şifre": "Username + password",
  "Klasik giriş": "Classic login",
  "Geçiş anahtarı": "Passkey",
  "Cihaz biyometrisiyle giriliyor, şifresi yok": "Signed in with device biometrics; there is no password",
  "Google ile giriş": "Sign in with Google",
  "Şifre Google hesabında": "The password lives in the Google account",
  "Microsoft ile giriş": "Sign in with Microsoft",
  "Şifre Microsoft hesabında": "The password lives in the Microsoft account",
  "E-posta bağlantısı": "Email link",
  "Her girişte e-postaya bağlantı gelir": "A link is emailed on every sign-in",
  "E-imza / sertifika": "E-signature / certificate",
  "Kart ya da mobil imza gerekiyor": "Needs a card or mobile signature",

  // ─────────────────────────────────────────────── Hesap formu
  "Hesap adı *": "Account name *",
  Kategori: "Category",
  "Giriş adresi": "Login address",
  "Giriş yöntemi": "Login method",
  Sorumlu: "Owner",
  Seçilmedi: "Not selected",
  "Team — 5 koltuk": "Team — 5 seats",
  "Not (şifre DEĞİL: “kurumsal kartla ödeniyor” gibi bilgiler)":
    "Note (NOT a password: things like “paid with the company card”)",
  "Giriş bilgileri (kullanıcı adı, şifre) bu formda değil: hesabı kaydettikten sonra “Giriş bilgileri”nden eklenir.":
    "Logins (username, password) aren't in this form: add them from “Logins” after you save the account.",
  "Şifre alanını boş bırakıp yalnızca kullanıcı adını ve notu kaydedebilirsiniz.":
    "You can leave the password empty and save just the username and the note.",
  "Hesap adı gerekli": "Account name is required",
  "Hesap kaydedilemedi": "Couldn't save the account",

  // ─────────────────────────────────────────────── Abonelik
  "Ücretli abonelik": "Paid subscription",
  "Tutar *": "Amount *",
  "Ödeme aralığı": "Billing interval",
  "Sıradaki ödeme": "Next payment",
  "Bu gider {kasa} kasasına düzenli gider olarak yazılır; vadesi geldikçe deftere işlenir.":
    "This cost is added to the {kasa} ledger as a recurring expense and posted to the ledger as each payment falls due.",
  "Bu gider kasaya düzenli gider olarak yazılır; vadesi geldikçe deftere işlenir.":
    "This cost is added to the ledger as a recurring expense and posted as each payment falls due.",
  "Aboneliği kasaya işlemek için bütçe yetkisi gerekiyor. Hesabı ücretsiz olarak kaydedebilirsiniz.":
    "Posting a subscription to the ledger needs budget permission. You can still save the account as free.",

  // ─────────────────────────────────────────────── Giriş bilgileri
  "Giriş bilgileri": "Logins",
  "{hesap} · giriş bilgileri": "{hesap} · logins",
  "Bilgiler sunucuda şifreli saklanır. Görmek için kilidi açmanız gerekir ve her gösterim kaydedilir.":
    "The details are stored encrypted on the server. You have to unlock to see them, and every reveal is logged.",
  "Bu hesap için kayıtlı giriş yok.": "No login saved for this account.",
  "Şifre girilmemiş": "No password saved",
  "2FA anahtarı": "2FA secret",
  "2FA anahtarı (varsa)": "2FA secret (if any)",
  "2FA anahtarı var": "Has a 2FA secret",
  "Kullanıcı adı, not ve 2FA anahtarı yazdığınızla değiştirilir; boş bırakırsanız temizlenir.":
    "Username, note and 2FA secret are replaced by what you type; leave them empty to clear them.",
  "Görme yetkiniz yok": "You don't have permission to see this",
  "Bilgiler gösterilemedi": "Couldn't show the details",
  "Bu gösterim kaydedildi.": "This reveal was logged.",
  "“{etiket}” kaydı silinsin mi? Şifre geri getirilemez.": "Delete “{etiket}”? The password can't be recovered.",

  // ─────────────────────────────────────────────── Kilit
  "Giriş bilgilerini görmek için kilidi açın": "Unlock to see the logins",
  "Oturumun açık olması yeterli değil: açık kalmış bir ekran başkasının eline geçebilir.":
    "Being signed in isn't enough: a screen left open can end up in someone else's hands.",
  "Projelio şifreniz": "Your Projelio password",
  "Kilidi aç": "Unlock",
  "Kilit açık ({yontem}) · {n} sn": "Unlocked ({yontem}) · {n}s",
  "Kilit kapalı": "Locked",
  "Kilit açılamadı": "Couldn't unlock",
  "Hesap şifresiyle": "With the account password",
  "Geçiş anahtarıyla": "With a passkey",
  "Geçiş anahtarıyla aç": "Unlock with a passkey",
  "Geçiş anahtarıyla açılamadı": "Couldn't unlock with a passkey",
  "Cihaz bekleniyor…": "Waiting for the device…",
  "Doğrulama tamamlanmadı.": "Verification wasn't completed.",

  // ─────────────────────────────────────────────── Paylaşım
  "{hesap} hesabını paylaş": "Share {hesap}",
  "Tüm hesapları paylaş": "Share every account",
  "Paylaşılan kişi bu hesabın giriş bilgilerini görebilir; düzenleyemez. Her gösterim kaydedilir.":
    "The person you share with can see this account's logins but not change them. Every reveal is logged.",
  "Paylaşılan kişi bu listedeki TÜM hesapların giriş bilgilerini görebilir; düzenleyemez.":
    "The person you share with can see the logins of EVERY account in this list, but can't change them.",
  Kişi: "Person",
  Seçin: "Pick one",
  "Bitiş (isteğe bağlı)": "Ends (optional)",
  "Henüz paylaşılmadı.": "Not shared with anyone yet.",
  Süresiz: "No end date",
  "{tarih} tarihine kadar": "until {tarih}",
  Kaldırıldı: "Removed",
  "Süresi geçti": "Expired",
  Kaldır: "Remove",
  "Paylaşılamadı": "Couldn't share",
  "Paylaşım kaldırılamadı": "Couldn't remove the share",
  "Paylaşımlar yüklenemedi": "Couldn't load the shares",
  "Modül ekibinde kimse yok. Önce ekip sekmesinden kişi ekleyin.":
    "Nobody is on the module team yet. Add people from the team tab first.",

  // ─────────────────────────────────────────────── Yetki gerekçeleri
  "Bilgiyi giren kişi": "The person who entered it",
  "Bu hesap paylaşıldı": "This account was shared with you",
  "Tüm hesaplar paylaşıldı": "Every account was shared with you",

  // ─────────────────────────────────────────────── Geçiş anahtarları (Ayarlar)
  "Geçiş anahtarları": "Passkeys",
  "Hesap şifrelerinin kilidini parmak izi, yüz ya da PIN ile açmak için cihaz ekle. Cihazdaki özel anahtar Projelio'ya hiç gönderilmez.":
    "Add a device to unlock account passwords with your fingerprint, face or PIN. The private key never leaves your device.",
  "Kayıtlı cihaz yok. Bir cihaz eklerseniz hesap şifrelerinin kilidini parmak izi, yüz ya da PIN ile açabilirsiniz.":
    "No device saved yet. Add one to unlock account passwords with your fingerprint, face or PIN.",
  "Bu cihazı ekle": "Add this device",
  Cihaz: "Device",
  "Eklendi: {tarih}": "Added: {tarih}",
  "son kullanım: {tarih}": "last used: {tarih}",
  "Bu geçiş anahtarı kaldırılsın mı? Bu cihazla kilit açamazsınız.":
    "Remove this passkey? You won't be able to unlock with this device.",
  "Bu cihaz zaten kayıtlı.": "This device is already registered.",
  "Ekleme tamamlanmadı.": "Setup wasn't completed.",
  "Geçiş anahtarı eklenemedi": "Couldn't add the passkey",
  Kaldırılamadı: "Couldn't remove",
  "Bu tarayıcı geçiş anahtarını desteklemiyor. Kilidi Projelio şifrenizle açabilirsiniz.":
    "This browser doesn't support passkeys. You can unlock with your Projelio password instead.",
};
