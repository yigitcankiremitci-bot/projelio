import type { TranslationDict } from "@projelio/shared";

/**
 * Bütçe hiyerarşisi — iş / departman / şirket / holding bütçe sekmeleri,
 * T tablosu, nakit akışı grafiği, görev bütçesi onay akışı ve görünürlük
 * ayarı.
 *
 * "Kasa" ÇEVRİLMEDİ (bkz. yaptim.ts'teki aynı gerekçe): ürünün kendi
 * sözlüğüne ait bir ad. Ama "Holding kasası" gibi tamlamalarda İngilizce
 * karşılık kullanılıyor — orada sözcük ad değil, ekranı tarif ediyor.
 */
export const butce: TranslationDict = {
  // ─────────────────────────────────────────────── Kademeler ve özet
  "Alt kademeler": "Lower levels",
  "Alt kademelerden": "From lower levels",
  "Alt kademelerden henüz bir hareket toplanmadı.": "No entries have rolled up from lower levels yet.",
  "Bu kademenin kendi kaydı": "This level's own entries",
  "Bu kademenin kayıtları": "Entries at this level",
  "Bu kademeye henüz doğrudan bir kayıt girilmedi.": "Nothing has been entered directly at this level yet.",
  "Holding kasası": "Holding treasury",
  Holding: "Holding",
  Organizasyon: "Organization",
  Departman: "Department",
  Rutin: "Routine",
  Kişisel: "Personal",

  // ─────────────────────────────────────────────── T tablosu ve grafik
  "Gelir / Gider tablosu": "Income / Expense table",
  Bakiye: "Balance",
  "Nakit akışı": "Cash flow",
  "Nakit akışı grafiği": "Cash flow chart",
  "Birikimli bakiye": "Running balance",
  "Dönem sonu": "Period end",
  "Grafik için henüz yeterli hareket yok.": "Not enough entries to chart yet.",
  "Para birimi": "Currency",

  // ─────────────────────────────────────────────── Düzenli gelir/giderler
  "Düzenli gelir / giderler": "Recurring income / expenses",
  "+ Düzenli ekle": "+ Add recurring",
  "+ Kayıt ekle": "+ Add entry",
  "Düzenli bir gelir/gider tanımlı değil.": "No recurring income or expense is set up.",
  "Düzenli ödemeyi sil": "Delete recurring payment",
  "Kategori (örn. Kira, Maaş, Abonelik)": "Category (e.g. Rent, Payroll, Subscription)",
  "Kategori (örn. Kira, Yazılım, Satış)": "Category (e.g. Rent, Software, Sales)",
  "İlk vade tarihini seç": "Pick the first due date",
  Sıradaki: "Next",
  Haftalık: "Weekly",

  // ─────────────────────────────────────────────── Görev bütçesi onayı
  "Bütçe onayı bekliyor": "Budget approval pending",
  "Bütçe onaylandı": "Budget approved",
  "Bütçe reddedildi": "Budget rejected",
  "Onaylandı, ödeme bekliyor": "Approved, awaiting payment",
  "Ret gerekçesi (isteğe bağlı)": "Reason for rejection (optional)",
  "Yine de onayla": "Approve anyway",
  İsteyen: "Requested by",
  "Karar kaydedilemedi.": "Couldn't save the decision.",
  "Ödeme işlenemedi.": "Couldn't record the payment.",
  "{gorev} için {tutar} bütçe onayı isteniyor.": "{tutar} budget approval requested for {gorev}.",
  "{gorev} için istediğin bütçe onaylandı.": "The budget you requested for {gorev} was approved.",
  "{gorev} için istediğin bütçe reddedildi.": "The budget you requested for {gorev} was rejected.",

  // ─────────────────────────────────────────────── Görünürlük
  "Bütçeyi görenler": "Who can see this budget",
  "Sahibi ve yöneticileri bu bütçeyi zaten görür. Buraya eklediklerin de görebilir.":
    "Owners and managers can already see this budget. Anyone you add here can too.",
  "İsim ya da e-posta ile ara": "Search by name or email",
  "Kayıt da girebilsin": "Can add entries too",
  "Görüntüler ve kayıt girer": "Can view and add entries",
  "Yalnızca görüntüler": "View only",
  "Görünürlüğü kaldır": "Remove access",
  "Henüz kimseye ayrıca görünürlük verilmedi.": "No one has been granted extra access yet.",
  "Kullanıcı eklenemedi.": "Couldn't add that person.",

  // ─────────────────────────────────────────────── Alacak / borç
  "Henüz tahsil edilmemiş / ödenmemiş tutarlar. Bakiyeye dahil değildir.":
    "Amounts not yet collected or paid. Not included in the balance.",
  "Kapananları gizle": "Hide settled",
  Kapananlar: "Settled",
  gecikmiş: "overdue",
  yaklaşan: "due soon",

  // ─────────────────────────────────────────────── Hatalar ve yetki
  "Bu bütçeyi görüntüleyemiyorsun.": "You can't view this budget.",
  "Kayıt kaydedilemedi.": "Couldn't save the entry.",
  "Bu bütçeyi görüntüleme yetkiniz yok": "You don't have permission to view this budget",
  "Bu bütçeye kayıt ekleme yetkiniz yok": "You don't have permission to add entries to this budget",
  "Bütçeyi kimlerin göreceğine yalnızca sahibi veya yöneticisi karar verebilir":
    "Only the owner or a manager can decide who sees this budget",
  "Taşerona bütçe görünürlüğü verilemez": "Subcontractors can't be given budget access",
  "Bütçe kademesi bulunamadı": "Budget level not found",
  "Tanınmayan bütçe kademesi": "Unknown budget level",
  "Holding bulunamadı": "Holding not found",
  "Kayıt bu bütçe kademesine ait değil": "This entry doesn't belong to this budget level",
  "Bu düzenli ödemeyi düzenleme yetkin yok": "You don't have permission to edit this recurring payment",
  "Bu görev için bütçe talep etme yetkiniz yok": "You don't have permission to request a budget for this task",
  "Bu görevde onaylanacak bir bütçe yok": "This task has no budget to approve",
  "Bütçe talebi sıfırdan büyük olmalı": "A budget request must be greater than zero",
  "Ödenmiş bir görevin bütçesi değiştirilemez": "The budget of a paid task can't be changed",
  "Ödenmiş bir görevin kararı değiştirilemez": "The decision on a paid task can't be changed",
  "Yalnızca onaylanmış (planlanan) bir bütçe ödenmiş sayılabilir":
    "Only an approved (planned) budget can be marked as paid",
  "Bu görev ödenmiş görünmüyor": "This task doesn't appear to be paid",
  "Görevin bağlı olduğu kademe bulunamadı": "Couldn't find the level this task belongs to",
  "Görev bütçesini yalnızca departman yöneticisi ya da organizasyon sahibi onaylayabilir":
    "Only a department manager or the organization owner can approve a task budget",
  "Görev bütçesini yalnızca proje yöneticisi ya da iş sahibi onaylayabilir":
    "Only the project manager or the job owner can approve a task budget",
  "Görev bütçesini yalnızca iş sahibi onaylayabilir": "Only the job owner can approve a task budget",

  // ─────────────────────────────────────────────── Düzenliye çevirme ve hedef seçimi
  "Bu kaydı düzenli hâle getirme yetkin yok": "You don't have permission to make this entry recurring",
  "Hakediş/ödeme kayıtları düzenli hâle getirilemez": "Payout entries can't be made recurring",
  "Bu kayıt zaten bir düzenli ödemeden üretilmiş": "This entry was already generated by a recurring payment",
  "Tanınmayan hedef türü": "Unrecognized target type",
  "Seçilen hedef bu bütçenin altında değil": "The chosen target isn't below this budget",
};
