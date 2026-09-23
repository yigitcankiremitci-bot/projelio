import type { TranslationDict } from "@projelio/shared";

/**
 * Ekip Hesapları — "hesabın açıldı" e-postası ve modülün hata mesajları
 * (bkz. modules/ekip-hesaplari, auth/giris-baglantisi.service.ts).
 */
export const ekipHesaplari: TranslationDict = {
  // ─────────────────────────────────────────────── E-posta
  "{sirket} ekibine eklendin": "You've been added to the {sirket} team",
  "{yonetici}, seni Projelio'da {sirket} ekibine ekledi ve senin için bir hesap açtı.":
    "{yonetici} added you to the {sirket} team on Projelio and created an account for you.",
  "Hesabına gir": "Sign in to your account",
  "Bu bağlantı 7 gün geçerli ve tek kullanımlık. Sonrasında e-posta adresin ve şifrenle giriş yapabilirsin.":
    "This link is valid for 7 days and works once. After that, sign in with your email and password.",
  "İlk girişte kendi şifreni belirlemen istenecek.": "You'll be asked to set your own password when you first sign in.",
  "Şifreni yöneticinden alabilir ya da giriş ekranındaki “Şifremi unuttum” ile kendin belirleyebilirsin.":
    "Get your password from your manager, or set one yourself with “Forgot password” on the sign-in screen.",
  "Bu kişiyi tanımıyorsan ya da bu e-postayı beklemiyorsan bağlantıya tıklama.":
    "If you don't know this person or weren't expecting this email, don't click the link.",

  // ─────────────────────────────────────────────── Lio
  "{ad} için Projelio hesabı açılacak ve {eposta} adresine giriş bağlantısı gönderilecek.\nDepartman: {departmanlar}\nŞifreyi kişi ilk girişte kendisi belirler.":
    "A Projelio account will be created for {ad} and a sign-in link sent to {eposta}.\nDepartment: {departmanlar}\nThey'll set their own password on first sign-in.",
  "Ekip hesabı açıldı": "Team account created",

  // ─────────────────────────────────────────────── Hatalar
  "Giriş bağlantısı geçersiz ya da süresi dolmuş. Yöneticinden yeni bir bağlantı iste ya da şifrenle giriş yap.":
    "This sign-in link is invalid or has expired. Ask your manager for a new one or sign in with your password.",
  "Ekip hesabı açmak için şirket sahibi ya da bir departmanın yöneticisi olmalısın.":
    "You need to be the company owner or a department manager to create team accounts.",
  "Bu e-posta adresiyle zaten bir Projelio hesabı var. Kişiyi departmanın Ekip sekmesinden kadroya davet edebilirsin.":
    "There's already a Projelio account with this email. Invite them to the staff from the department's Team tab instead.",
  "Bu hesabı sen açmadın; bağlantıyı şirket sahibi ya da hesabı açan kişi gönderebilir.":
    "You didn't create this account; only the company owner or whoever created it can send the link.",
  "Bu kişi hesabına zaten girdi. Şifresini unuttuysa giriş ekranındaki “Şifremi unuttum”u kullanabilir.":
    "This person has already signed in. If they forgot their password, they can use “Forgot password” on the sign-in screen.",
  "Hesap açıldı ama listede bulunamadı": "The account was created but isn't in the list",
  "Hesap kaydı bulunamadı": "Account record not found",
  "Yeni şifre, yöneticinin belirlediği şifreyle aynı olamaz.": "Your new password can't be the one your manager set.",
  "Şifreni Ayarlar > Hesap bölümünden değiştirebilirsin.": "You can change your password in Settings > Account.",
  "Kullanıcı adı 3-30 karakter olmalı; sadece küçük harf, rakam, nokta ve alt çizgi içerebilir.":
    "Username must be 3-30 characters: lowercase letters, digits, dots and underscores only.",
  "Ad soyad 2-120 karakter olmalı.": "Full name must be 2-120 characters.",
  "Geçerli bir e-posta adresi gir.": "Enter a valid email address.",
  "Şifre 8-72 karakter olmalı.": "Password must be 8-72 characters.",
  "Görev en fazla 120 karakter olabilir.": "Job title can be at most 120 characters.",
  "Telefon en fazla 40 karakter olabilir.": "Phone can be at most 40 characters.",
  "Not en fazla 1000 karakter olabilir.": "The note can be at most 1000 characters.",
  "En az bir departman seç.": "Pick at least one department.",
  "Bu departmana hesap açma yetkin yok.": "You can't create accounts in this department.",
  "Geçersiz kadro rolü.": "Invalid staff role.",
  "Aynı departman iki kez seçilmiş.": "The same department was selected twice.",
  "Modül seçimi geçersiz.": "Invalid module selection.",
  "Modül, seçilen departmanlardan birine ait olmalı.": "Each module must belong to one of the selected departments.",
  "Seçilen modül bu departmanda açık değil.": "The selected module isn't enabled in this department.",
};
