import type { TranslationDict } from "@projelio/shared";

/** Giriş, kayıt, şifre sıfırlama, e-posta doğrulama. */
export const kimlik: TranslationDict = {
  // ══════════════════════════════════════════════════════ Ortak alanlar
  // Login, Register ve ForgotPassword aynı form alanlarını paylaşıyor.
  "E-posta": "Email",
  "ad.soyad@sirket.com": "name.surname@company.com",
  "Şifre": "Password",
  "En az 8 karakter": "At least 8 characters",
  "Ad Soyad": "Full name",
  kullaniciadi: "username",
  "Gönderiliyor…": "Sending…",
  "Freelance proje & görev yönetimi": "Freelance project & task management",

  // ══════════════════════════════════════════════════════ Giriş
  "Giriş yap": "Sign in",
  "Giriş yapılıyor…": "Signing you in…",
  "Giriş sayfası": "Sign-in page",
  "Girişe dön": "Back to sign-in",
  "Giriş ekranına dön": "Back to sign-in",
  "Girişe git": "Go to sign-in",
  "Hesabın yok mu? Kayıt ol": "No account? Sign up",
  "Şifremi unuttum": "Forgot password",
  "E-posta veya şifre hatalı.": "Incorrect email or password.",
  "Oturumun sona erdi. Verilerin yerinde — tekrar giriş yaptığında hepsi karşında olacak.":
    "Your session has ended. Your data is untouched — it will all be there when you sign in again.",
  // Hesap kilidi geri sayımı; {sure} dakika:saniye biçiminde gelir.
  "Kalan süre {sure}.": "Time left {sure}.",
  "Doğrulama bağlantısını tekrar gönder": "Resend verification link",
  "Yeni doğrulama bağlantısı gönderildi. E-postanı kontrol et.":
    "New verification link sent. Check your email.",

  // Demo hesabı kartı
  "Üye olmadan gezmek ister misin?": "Want to look around without signing up?",
  "Hazır bir demo hesabı var: örnek bir şirketin projeleri, görevleri, bütçesi ve raporlarıyla birlikte her yeri dolaşabilirsin.":
    "There is a demo account ready: walk through a sample company's projects, tasks, budget and reports.",
  "Demo hesabıyla gir": "Sign in with the demo account",
  "Her şeyi deneyebilirsin: eklediğin, değiştirdiğin, sildiğin ne varsa bir sonraki girişte ilk haline döner. Hesap herkese açık olduğu için aynı anda başkaları da içeride olabilir — gerçek veri ya da kişisel bilgi girme.":
    "Try anything you like: whatever you add, change or delete is reset at the next sign-in. The account is public, so other people may be inside at the same time — don't enter real or personal data.",

  // ══════════════════════════════════════════════════════ Kayıt
  "Kayıt ol": "Sign up",
  "Kayıt sayfası": "Sign-up page",
  "Kayıt oluşturuluyor…": "Creating your account…",
  "Kayıt oluşturulamadı, tekrar dener misin?": "Could not create your account. Try again?",
  "Zaten hesabın var mı? Giriş yap": "Already have an account? Sign in",
  "E-postanı kontrol et": "Check your email",
  "{eposta} adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra giriş yapabilirsin.":
    "We sent a verification link to {eposta}. Once you click it you can sign in.",
  "Bağlantı 24 saat geçerli. E-posta birkaç dakika içinde gelmezse spam klasörüne de bak.":
    "The link is valid for 24 hours. If nothing arrives within a few minutes, check your spam folder.",
  "Bu adresle zaten bir hesabın varsa yeni hesap açılmadı; onun yerine giriş yapmanı hatırlatan bir e-posta gönderdik.":
    "If you already have an account with this address, no new account was created; we sent you an email reminding you to sign in instead.",
  "Bağlantıyı tekrar gönder": "Resend the link",
  "Yeni bağlantı gönderildi.": "New link sent.",

  // Kayıt onayı cümlesi PARÇALI: aradaki bağlantılar yüzünden tek anahtar
  // olamıyor. Türkçede ekler ayrı düğümlerde ("…Sözleşmesi'ni ve"), İngilizcede
  // aynı boşluklara bağlaçlar geliyor — parçalar bu yüzden birebir çeviri değil,
  // yan yana gelince doğru cümleyi kuracak biçimde yazıldı.
  "Kayıt olarak": "By signing up you confirm that you have read and accept the",
  "'ni ve": " and the",
  "'nı okuduğunu ve kabul ettiğini,": ", and that you have read the",
  "'ni okuduğunu beyan etmiş olursun.": ".",

  // ══════════════════════════════════════════════════════ Şifre sıfırlama
  "E-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.":
    "Enter your email address and we'll send you a reset link.",
  "Sıfırlama bağlantısı gönder": "Send reset link",
  "Bu e-posta adresi kayıtlıysa, şifre sıfırlama bağlantısı gönderildi. Gelen kutunu kontrol et.":
    "If this email address is registered, a reset link has been sent. Check your inbox.",
  "Bir şeyler ters gitti. Tekrar dene.": "Something went wrong. Try again.",
  "Yeni şifre belirle": "Set a new password",
  "Şifreyi güncelle": "Update password",
  "Güncelleniyor…": "Updating…",
  "Şifreler eşleşmiyor.": "Passwords don't match.",
  "Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir.":
    "Could not update your password. The link may have expired.",
  "Şifren güncellendi. Artık yeni şifrenle giriş yapabilirsin.":
    "Your password has been updated. You can sign in with it now.",
  "Bağlantı geçersiz. Sıfırlama e-postasındaki bağlantıyı kullandığından emin ol.":
    "This link is invalid. Make sure you used the link from the reset email.",
  "Yeni bağlantı iste": "Request a new link",

  // ══════════════════════════════════════════════════════ E-posta doğrulama
  "Doğrulanıyor…": "Verifying…",
  "Bir saniye.": "One moment.",
  "Hesabın hazır": "Your account is ready",
  "Doğrulanamadı": "Verification failed",
  "Doğrulama başarısız oldu.": "Verification failed.",
  "E-posta adresin doğrulandı.": "Your email address is verified.",
  "Bağlantı geçersiz. E-postandaki bağlantıyı kullandığından emin ol.":
    "This link is invalid. Make sure you used the link from your email.",

  // ══════════════════════════════════════════════════════ Google / Microsoft dönüşü
  "Google ile devam edilemedi": "Couldn't continue with Google",
  "Google izni verilmedi. Devam etmek için izin vermeniz gerekiyor.":
    "Google access wasn't granted. You need to allow it to continue.",
  "Google'dan beklenen yanıt gelmedi.": "Google didn't return the expected response.",
  "Microsoft ile devam edilemedi": "Couldn't continue with Microsoft",
  "Microsoft izni verilmedi. Devam etmek için izin vermeniz gerekiyor.":
    "Microsoft access wasn't granted. You need to allow it to continue.",
  "Microsoft'tan beklenen yanıt gelmedi.": "Microsoft didn't return the expected response.",
  "OneDrive bağlanamadı": "Couldn't connect OneDrive",
  "Ayarlara dön": "Back to settings",
  "Bağlanıyor…": "Connecting…",

  // ══════════════════════════════════════════════════════ Habie köprüsü
  "Habie'ye bağlanılıyor…": "Connecting to Habie…",
  "Bağlanılamadı": "Couldn't connect",
  "Habie bağlantısı kurulamadı.": "Couldn't connect to Habie.",
  "Birkaç saniye sürebilir, otomatik yönlendirileceksin.":
    "This can take a few seconds; you'll be redirected automatically.",
  "Panele dön": "Back to the dashboard",

  // ─────────────────────────────────────────────── Sosyal giriş
  // Sağlayıcı adı cümlenin İÇİNDE ve İngilizcede sonda: "Sign in with Google".
  // Bu yüzden her sağlayıcı ve kip için ayrı anahtar var, yer tutucu yok.
  veya: "or",
  "Google ile giriş yap": "Sign in with Google",
  "Google ile kayıt ol": "Sign up with Google",
  "Microsoft ile giriş yap": "Sign in with Microsoft",
  "Microsoft ile kayıt ol": "Sign up with Microsoft",
  "Outlook, Hotmail, Live ya da iş/okul hesabı": "Outlook, Hotmail, Live or a work/school account",
  "Yönlendiriliyor…": "Redirecting…",
  "Bu giriş yöntemi şu anda kullanılamıyor.": "This sign-in method isn't available right now.",
  "Giriş başlatılamadı.": "Could not start the sign-in.",
};
