import type { TranslationDict } from "@projelio/shared";

/**
 * İşe alım daveti — bildirimler ve modülün hata mesajları
 * (bkz. modules/ise-alim, migration 143).
 */
export const iseAlim: TranslationDict = {
  // ─────────────────────────────────────────────── Bildirimler
  "İşe alım daveti": "Job offer",
  "{kisi}, seni {sirket} ekibine katılmaya davet etti.": "{kisi} invited you to join the {sirket} team.",
  "{sirket} ekibine katılmaya davet edildin.": "You've been invited to join the {sirket} team.",
  "İşe alım kabul edildi": "Job offer accepted",
  "İşe alım reddedildi": "Job offer declined",
  "{kisi}, {sirket} işe alım davetini kabul etti ve ekibe katıldı.":
    "{kisi} accepted the {sirket} job offer and joined the team.",
  "{kisi}, {sirket} işe alım davetini reddetti.": "{kisi} declined the {sirket} job offer.",

  // ─────────────────────────────────────────────── Hatalar
  "İşe alınacak kişiyi seç.": "Choose the person to hire.",
  "Pozisyon en fazla 120 karakter olabilir.": "Position can be at most 120 characters.",
  "İş tanımı en fazla 2000 karakter olabilir.": "Job description can be at most 2000 characters.",
  "Bu departmana kişi alma yetkin yok.": "You don't have permission to hire into this department.",
  "Şirketin ekibini görme yetkin yok.": "You don't have permission to see the company's team.",
  "Kendini işe alamazsın.": "You can't hire yourself.",
  "Bu kişi zaten şirketin sahibi.": "This person already owns the company.",
  "Bu kişi seçtiğin departmanların ve modüllerin hepsinde zaten var.":
    "This person is already in all the departments and modules you selected.",
  "Bu kişiye bu şirketten bekleyen bir işe alım daveti zaten var.":
    "This person already has a pending job offer from this company.",
  "Davet bulunamadı": "Invitation not found",
  "Bu daveti yalnızca davet edilen kişi yanıtlayabilir.": "Only the invited person can respond to this invitation.",
  "Bu davet artık geçerli değil.": "This invitation is no longer valid.",
  "Bu davet artık beklemede değil.": "This invitation is no longer pending.",
  "Bu daveti yalnızca gönderen ya da şirket sahibi geri çekebilir.":
    "Only the sender or the company owner can withdraw this invitation.",
  "Davetteki departmanlar artık yok. Yöneticinden yeni bir davet iste.":
    "The departments in this invitation no longer exist. Ask your manager for a new invitation.",
};
