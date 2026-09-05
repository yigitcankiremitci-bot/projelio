import type { TranslationDict } from "@projelio/shared";

/**
 * Doğrulama, şifre sıfırlama, hesap silme ve "hesabın zaten var" e-postaları —
 * konu, başlık, gövde ve düz metin sürümleri.
 *
 * Bu metinler HTML parçası içerebiliyor (`<strong>`); etiketler çeviride de
 * korunmalı, yoksa e-postada kalın yazı kaybolur ya da bozuk etiket görünür.
 */
export const epostalar: TranslationDict = {
  // ─────────────────────────────────────────────── Ortak iskelet
  "Düğme çalışmazsa bu adresi tarayıcına yapıştırabilirsin:":
    "If the button doesn't work, paste this address into your browser:",

  // ─────────────────────────────────────────────── Şifre sıfırlama
  "Projelio şifre sıfırlama": "Reset your Projelio password",
  "Şifreni sıfırla": "Reset your password",
  "Projelio hesabın için şifre sıfırlama talebinde bulunuldu. Yeni şifreni belirlemek için aşağıdaki düğmeye tıkla. Bu bağlantı <strong>1 saat</strong> boyunca geçerli.":
    "Someone asked to reset the password for your Projelio account. Click the button below to set a new one. This link is valid for <strong>1 hour</strong>.",
  "Yeni şifre belirle": "Set a new password",
  "Bu talebi sen yapmadıysan bu e-postayı yok sayabilirsin — şifren değişmeyecek.":
    "If you didn't request this, you can ignore this email — your password won't change.",
  "Projelio hesabın için şifre sıfırlama talebinde bulunuldu.":
    "Someone asked to reset the password for your Projelio account.",
  "Yeni şifreni belirlemek için aşağıdaki adresi tarayıcına yapıştır:":
    "Paste the address below into your browser to set a new password:",
  "Bu bağlantı 1 saat boyunca geçerlidir.": "This link is valid for 1 hour.",

  // ─────────────────────────────────────────────── E-posta doğrulama
  "Projelio hesabını doğrula": "Verify your Projelio account",
  "Hesabını doğrula": "Verify your account",
  "Projelio'ya hoş geldin! Hesabını kullanmaya başlamak için e-posta adresini doğrulaman gerekiyor. Bu bağlantı <strong>24 saat</strong> boyunca geçerli.":
    "Welcome to Projelio. Verify your email address to start using your account. This link is valid for <strong>24 hours</strong>.",
  "E-postamı doğrula": "Verify my email",
  "Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin.":
    "If you didn't create this account, you can ignore this email.",
  "Projelio'ya hoş geldin! Hesabını kullanmaya başlamak için e-posta adresini doğrulaman gerekiyor.":
    "Welcome to Projelio. Verify your email address to start using your account.",
  "Aşağıdaki adresi tarayıcına yapıştır:": "Paste the address below into your browser:",
  "Bu bağlantı 24 saat boyunca geçerlidir.": "This link is valid for 24 hours.",

  // ─────────────────────────────────────────────── Hesabın zaten var
  "Projelio hesabın zaten var": "You already have a Projelio account",
  "Bu adresle zaten bir hesabın var": "You already have an account with this address",
  "Az önce bu e-posta adresiyle Projelio'da yeni bir hesap açılmaya çalışıldı. Adres zaten kayıtlı olduğu için <strong>yeni bir hesap oluşturulmadı</strong> ve mevcut hesabında hiçbir şey değişmedi.":
    "Someone just tried to create a new Projelio account with this email address. Because the address is already registered, <strong>no new account was created</strong> and nothing changed on your existing one.",
  "Giriş yap": "Sign in",
  'Şifreni hatırlamıyorsan giriş ekranındaki "Şifremi unuttum" ile sıfırlayabilirsin. Bunu sen yapmadıysan bu e-postayı yok sayabilirsin.':
    'If you don\'t remember your password, reset it with "Forgot password" on the sign-in screen. If this wasn\'t you, you can ignore this email.',
  "Az önce bu e-posta adresiyle Projelio'da yeni bir hesap açılmaya çalışıldı.":
    "Someone just tried to create a new Projelio account with this email address.",
  "Adres zaten kayıtlı olduğu için yeni bir hesap oluşturulmadı ve mevcut hesabında hiçbir şey değişmedi.":
    "Because the address is already registered, no new account was created and nothing changed on your existing one.",
  "Giriş yapmak için:": "To sign in:",
  'Şifreni hatırlamıyorsan giriş ekranındaki "Şifremi unuttum" ile sıfırlayabilirsin.':
    'If you don\'t remember your password, reset it with "Forgot password" on the sign-in screen.',
  "Bunu sen yapmadıysan bu e-postayı yok sayabilirsin.": "If this wasn't you, you can ignore this email.",

  // ─────────────────────────────────────────────── Hesap silme
  "Projelio hesabın silinmek üzere": "Your Projelio account is scheduled for deletion",
  "Hesabın silinmek üzere": "Your account is scheduled for deletion",
  // Gün sayısı yer tutucuyla geliyor; İngilizcede tekil/çoğul ayrımı gerekiyor.
  "Hesabını silme talebini aldık. Verilerin <strong>{gun} gün</strong> daha duracak ve <strong>{tarih}</strong> tarihinde kalıcı olarak silinecek.":
    {
      one: "We've received your request to delete your account. Your data will be kept for <strong>{gun} more day</strong> and permanently deleted on <strong>{tarih}</strong>.",
      other:
        "We've received your request to delete your account. Your data will be kept for <strong>{gun} more days</strong> and permanently deleted on <strong>{tarih}</strong>.",
    },
  "Hesabını silme talebini aldık. Verilerin {gun} gün daha duracak ve {tarih} tarihinde kalıcı olarak silinecek.": {
    one: "We've received your request to delete your account. Your data will be kept for {gun} more day and permanently deleted on {tarih}.",
    other:
      "We've received your request to delete your account. Your data will be kept for {gun} more days and permanently deleted on {tarih}.",
  },
  "Fikrin değişirse bir şey yapmana gerek yok: bu tarihe kadar aynı e-posta ve şifreyle giriş yapman yeterli, hesabın olduğu gibi geri açılır.":
    "If you change your mind you don't have to do anything: just sign in with the same email and password before that date and your account comes back exactly as it was.",
  "Giriş yap ve hesabımı geri al": "Sign in and restore my account",
  "Bu talebi sen yapmadıysan hemen giriş yap — girişin kendisi silme talebini iptal eder. Tarih geçtikten sonra veriler geri getirilemez.":
    "If you didn't request this, sign in right away — signing in cancels the deletion by itself. After that date the data cannot be recovered.",
  "Fikrin değişirse bir şey yapmana gerek yok: bu tarihe kadar aynı e-posta ve şifreyle giriş yapman yeterli.":
    "If you change your mind you don't have to do anything: just sign in with the same email and password before that date.",
  "Bu talebi sen yapmadıysan hemen giriş yap — girişin kendisi silme talebini iptal eder.":
    "If you didn't request this, sign in right away — signing in cancels the deletion by itself.",
  "Tarih geçtikten sonra veriler geri getirilemez.": "After that date the data cannot be recovered.",
};
