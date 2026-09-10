import type { TranslationDict } from "@projelio/shared";

/**
 * Yaptım — kişisel iş günlüğü (sayfa + "Nereye ait?" penceresi).
 *
 * ÜRÜN ADI ÇEVRİLMEDİ. "Yaptım" bu ekranın adı, bir cümle değil; İngilizce
 * arayüzde de "Yaptım" kalıyor — tıpkı Kasa gibi ürünün kendi sözlüğüne ait
 * bir kelime. Çevirsek ("Done", "Did") menüde başka bir şeyi işaret ediyormuş
 * gibi okunurdu; Yapılacaklar (To-dos) ile karışması ise kesin.
 */
export const yaptim: TranslationDict = {
  // ─────────────────────────────────────────────── Sayfa
  Yaptım: "Yaptım",
  "Yaptığın işi buraya yaz, nereye ait olduğunu sonra seç. Hiç seçmesen de kaydın durur — önemli olan yapılan işin kaybolmaması.":
    "Write down what you did; pick where it belongs later. The entry stays even if you never pick — what matters is that the work isn't lost.",
  "Ne yaptın?": "What did you do?",
  Süre: "Duration",
  "Süre (örn. 45, 1s 30dk)": "Duration (e.g. 45, 1h 30m)",
  'Örnek: "45", "1s 30dk", "2 saat", "1:30"': 'For example: "45", "1h 30m", "2 hours", "1:30"',
  'Süreyi anlayamadım. Örnek: "45", "1s 30dk", "2 saat".': 'Couldn\'t read that duration. For example: "45", "1h 30m", "2 hours".',
  Başlat: "Start",
  "Kaydı aç ve kronometreyi başlat": "Add the entry and start the timer",
  "Kronometreyi başlat": "Start the timer",
  "Kronometreyi durdur": "Stop the timer",
  "Kronometre değiştirilemedi": "Couldn't change the timer",
  "Süre kaydedilemedi": "Couldn't save the duration",
  "Kayıt eklenemedi": "Couldn't add the entry",
  "Kayıt silinemedi": "Couldn't delete the entry",
  "Kayıtlar yüklenemedi": "Couldn't load the entries",
  "Süre: {sure}": "Duration: {sure}",
  "Lio ekledi": "Added by Lio",
  "Kayıt başlığı": "Entry title",
  "Düzenlemek için çift tıkla": "Double-click to edit",
  "Süreyi değiştir": "Change the duration",
  "Kayıt güncellenemedi": "Couldn't update the entry",
  "Kaydı sil": "Delete entry",
  "“{baslik}” kaydı silinsin mi?": "Delete the entry “{baslik}”?",
  "Bu aralıkta kayıt yok.": "No entries in this range.",
  "Yukarıya bir satır yaz — sonrası kolay.": "Write one line above — the rest is easy.",
  kayıt: { one: "entry", other: "entries" },
  bağlanmamış: "unlinked",
  "Son 7 gün": "Last 7 days",
  "Son 30 gün": "Last 30 days",
  Dün: "Yesterday",

  // ─────────────────────────────────────────────── Kayıtlı göreve bağlama
  "Ne yaptın? Görev adı yazarsan listeden seçebilirsin":
    "What did you do? Type a task name to pick it from the list",
  "Görevler aranıyor…": "Searching tasks…",
  "alt görev": "subtask",
  "şimdiye dek": "so far",
  Görev: "Task",
  "Görev bağlantısını kaldır": "Unlink the task",
  "Görevi yapıldı işaretle": "Mark the task done",
  "Görev kendi projesinde/departmanında da tamamlandıya geçer.":
    "The task is also set to completed in its own project or department.",
  "Takvime işle": "Add to the calendar",
  "Takvimde “yapıldı” bloğu olarak görünür.": "Shows up on the calendar as a “done” block.",
  "Takvimde “yapıldı” olarak duruyor": "Sits on the calendar as “done”",
  takvimde: "on the calendar",
  "Saat aralığı gir": "Enter a time range",
  "Süre gir": "Enter a duration",
  "Başlangıç saati": "Start time",
  "Bitiş saati": "End time",
  "Harcanan: {sure}": "Spent: {sure}",
  "Yaptım kayıtlarından": "from Yaptım entries",

  // ─────────────────────────────────────────────── "Nereye ait?" penceresi
  "Nereye ait?": "Where does it belong?",
  "Nereye ait? — projeye, göreve, kasaya aktar": "Where does it belong? — send it to a project, task or the ledger",
  "Görev olarak ekle": "Add as a task",
  "Seçtiğin projeye ya da departmana TAMAMLANMIŞ bir görev açar; ekip görür.":
    "Creates a COMPLETED task in the project or department you pick; the team sees it.",
  "Görev TAMAMLANMIŞ olarak açılır — bu iş zaten yapıldı; ayrıca kapatman gerekmez.":
    "The task is created as COMPLETED — the work is already done, you don't have to close it.",
  "Kasaya işle": "Record in the ledger",
  "Yapılan işi bir gelir ya da gider satırı olarak deftere yazar.":
    "Writes the work into the ledger as an income or expense line.",
  "Kaydın başlığı hareketin açıklaması, yapıldığı gün de tarihi olur.":
    "The entry's title becomes the description, and the day it was done becomes the date.",
  "Tutar (₺)": "Amount (₺)",
  "Kendi kasam": "My own ledger",
  "Modül defterine yaz": "Write to a module ledger",
  "Şirketin bir modülüne kayıt satırı ekler.": "Adds a record line to one of the company's modules",
  "Bu şirkette açık modül yok.": "This company has no modules turned on.",
  "Departman (opsiyonel)": "Department (optional)",
  "Deftere yaz": "Write to the ledger",
  "Yapılacaklarıma ekle": "Add to my to-dos",
  "Kişisel panonda tamamlanmış bir kart olarak görünür.": "Shows up as a completed card on your personal board.",
  "Sadece işaretle": "Just tag it",
  "Hiçbir yerde kayıt açmaz. Yalnızca bu satıra “şu işle ilgiliydi” notu düşer.":
    "Creates nothing anywhere. It only notes on this line which work it related to.",
  "Hiçbir yerde kayıt açılmaz, kimse görmez. Yalnızca bu satır “şu işle ilgiliydi” diye işaretlenir.":
    "Nothing is created anywhere and nobody sees it. This line is simply tagged with the related work.",
  İşaretle: "Tag it",
  "Bağlantıyı kaldır": "Remove the link",
  "Hedef proje": "Target project",
  "Hedef departman": "Target department",
  Modül: "Module",
  "Erişebildiğin bir kayıt yok.": "You don't have access to any records.",
  Aktarılamadı: "Couldn't transfer",
  Bağlanamadı: "Couldn't link",
};
