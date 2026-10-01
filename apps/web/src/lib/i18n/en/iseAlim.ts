import type { TranslationDict } from "@projelio/shared";

/**
 * İşe alım — şirket anasayfasındaki Ekip bölümü, "İşe al" formu ve davetin
 * açıldığı sayfa (bkz. components/iseAlim, pages/IseAlimDaveti.tsx).
 *
 * "İşe al" İngilizcede "Hire"; davet "job offer" değil "invitation" — kişi
 * zaten Projelio kullanıcısı ve şirkete katılmaya çağrılıyor.
 */
export const iseAlim: TranslationDict = {
  // ─────────────────────────────────────────────── Ekip bölümü
  "Ekibi göster": "Show team",
  "Ekibi gizle": "Hide team",
  "Ekip yüklenemedi": "Couldn't load the team",
  "Form açılamadı": "Couldn't open the form",
  "İşe almak için şirket sahibi ya da bir departmanın yöneticisi olmalısın.":
    "To hire, you need to be the company owner or a department manager.",
  "Kabul bekleyen davetler": "Invitations awaiting response",
  "Daveti geri çek": "Withdraw invitation",
  "Geri çekiliyor…": "Withdrawing…",
  "Davet geri çekilemedi": "Couldn't withdraw the invitation",
  "Henüz ekipte kimse yok.": "No one on the team yet.",
  "Henüz ekipte kimse yok. “+” menüsündeki “İşe al” ile Projelio'daki birini davet et ya da hesabı yoksa onun için hesap aç.":
    "No one on the team yet. Use “Hire” in the “+” menu to invite someone on Projelio, or create an account for them if they don't have one.",
  "{ad} kişisine işe alım daveti gönderildi. Kabul edince ekipte görünecek.":
    "Invitation sent to {ad}. They'll appear on the team once they accept.",
  "Hesap açıldı ama e-posta gönderilemedi. Ekip Hesapları modülünden bağlantıyı yeniden gönderebilirsin.":
    "The account was created but the email couldn't be sent. You can resend the link from the Team Accounts module.",

  // ─────────────────────────────────────────────── Form
  "Kişiye davet gider; kabul ettiğinde seçtiğin departmanlara ve modüllere erişir.":
    "They'll get an invitation; once they accept, they can access the departments and modules you choose.",
  "İşe al ve davet gönder": "Hire and send invitation",
  "İşe alınacak kişiyi seç.": "Choose the person to hire.",
  "Ad, kullanıcı adı (@) veya e-posta ile ara…": "Search by name, username (@) or email…",
  Ekipte: "On the team",
  "Projelio'da hesabı yok mu? Hesabını sen aç →": "Not on Projelio yet? Create their account →",
  "Pozisyon ve iş tanımı": "Position and job description",
  "Kadroda unvan olarak görünür; yetkiyi değiştirmez.": "Shown as their title on staff; doesn't change permissions.",
  "İş tanımı": "Job description",
  "Sorumlulukları, çalışma düzeni, başlangıç tarihi…": "Responsibilities, working hours, start date…",
  "Kişi daveti açınca okur.": "They'll read this when they open the invitation.",

  // ─────────────────────────────────────────────── Davet sayfası
  "{sirket} seni ekibine davet ediyor": "{sirket} is inviting you to join their team",
  "Daveti gönderen: {kisi}": "Sent by: {kisi}",
  "Kayıt girebileceğin modüller": "Modules you can add records to",
  "Kabul et ve katıl": "Accept and join",
  "Katılıyorsun…": "Joining…",
  "{kisi} henüz yanıt vermedi.": "{kisi} hasn't responded yet.",
  "Bu davet kabul edildi.": "This invitation was accepted.",
  "Bu davet reddedildi.": "This invitation was declined.",
  "Bu davet geri çekildi.": "This invitation was withdrawn.",
  "Davet bulunamadı": "Invitation not found",
};
