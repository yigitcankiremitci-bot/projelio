import type { TranslationDict } from "@projelio/shared";

/**
 * Bağlantı ve İlişkiler — Müşteriler panelinin ikinci defteri (fuarda
 * tanışılan kişiler, rakipler, olası işbirlikçiler).
 *
 * "Bağlantı" sosyal medya sözlüğünde "Link"; burada bir kişi olduğu için rol
 * bağlamıyla (##rol) "Contact" olarak ayrıldı.
 */
export const baglantilar: TranslationDict = {
  "Bağlantı ve İlişkiler": "Contacts & Relationships",
  "+ Bağlantı ekle": "+ Add contact",
  "Bağlantı ekle": "Add contact",
  "Bağlantı arşivleme": "Archive contact",
  "Henüz bağlantı yok. Fuarda, toplantıda tanıştığın kişileri buraya ekle; müşteri listesine karışmazlar.":
    "No contacts yet. Add the people you meet at fairs and meetings here; they stay out of your customer list.",

  // ─────────────────────────────────────────────── Roller
  "Bağlantı ##rol": "Contact",
  "Rakip ##rol": "Competitor",
  "İşbirliği ##rol": "Collaborator",
  "İşbirliği": "Collaboration",

  // ─────────────────────────────────────────────── Önem ve temas
  "Önem": "Priority",
  "Önem: tümü": "Priority: all",
  "Yüksek önem": "High priority",
  "Temas zamanı gelen": "Follow-up due",
  "Bugün temas": "Follow up today",
  "Temas gecikti · {tarih}": "Follow-up overdue · {tarih}",
  "Temas · {tarih}": "Follow up · {tarih}",
  "Nerede tanışıldı": "Where you met",
  "Tanışma tarihi": "Date met",
  "Sonraki temas": "Next follow-up",
  "Örn. İstanbul Fuarı 2026": "E.g. Istanbul Fair 2026",
  "Örn. Ayşe Yılmaz ya da ABC Ajans": "E.g. Jane Smith or ABC Agency",

  // ─────────────────────────────────────────────── İlişki notu
  "İlişki": "Relationship",
  "İlişki notu — yalnızca bu modülde görünür": "Relationship note — visible only in this module",
  "Örn. Rakip ama ihracat tarafında birlikte iş yapılabilir.": "E.g. A competitor, but we could work together on exports.",
  "İlişki notu yok. Düzenle ile ekleyebilirsin.": "No relationship note. You can add one with Edit.",

  // ─────────────────────────────────────────────── Müşteriye dönüşüm
  "Müşteri yap": "Make customer",
  "Bağlantılara ekle": "Add to contacts",
  "Kart Müşteriler listesinde de görünecek. İlişki notu satış ekibine açılmaz.":
    "The card will also appear in Customers. The relationship note stays hidden from the sales team.",
  "Kart Bağlantı ve İlişkiler listesinde de görünecek.": "The card will also appear in Contacts & Relationships.",

  // ─────────────────────────────────────────────── Takip görevleri
  "+ Takip görevi aç": "+ Add follow-up task",
  "Bu bağlantı için açılmış görev yok.": "No tasks for this contact yet.",
  "Takip görevi departman içinden açılır.": "Follow-up tasks are created from within a department.",
  "{ad} ile görüş": "Follow up with {ad}",

  // ─────────────────────────────────────────────── Excel
  "Excel ile toplu bağlantı ekle": "Bulk add contacts from Excel",
  "Projelio bağlantı şablonu": "Projelio contacts template",
  "Fuar dönüşü kartvizitleri tek seferde girmek için: şablonu indirin, doldurun, aynı yerden yükleyin.":
    "To enter business cards from a fair in one go: download the template, fill it in and upload it here.",
  "Her satır bir bağlantı. Yalnızca Ad zorunlu; önem, nerede tanışıldığı ve sonraki temas da yazılabilir.":
    "One contact per row. Only Name is required; you can also fill in priority, where you met and the next follow-up.",
  "Kendi listeniz de olur (.xlsx ya da .csv); tanınan sütunlar aktarılır.":
    "Your own list works too (.xlsx or .csv); recognized columns are imported.",
  "{n} bağlantı kartı açıldı.": { one: "{n} contact card created.", other: "{n} contact cards created." },
  "{n} satır okundu, {m} bağlantı eklenecek.": "{n} rows read, {m} contacts will be added.",
  "{n} satır okundu, eklenecek yeni bağlantı yok.": "{n} rows read, no new contacts to add.",
  "{n} bağlantıyı ekle": { one: "Add {n} contact", other: "Add {n} contacts" },
  "Bağlantıları ekle": "Add contacts",

  // ─────────────────────────────────────────────── Web ve sosyal hesaplar, öneriler
  "@{ornek} ya da profil adresi": "@{ornek} or profile URL",
  "+ Başka hesap ekle": "+ Add another account",
  "Başka hesap ekle": "Add another account",
  "{hesap} hesabı tanınmadı": "{hesap} account not recognized",
  "Örn. ornek.com": "E.g. example.com",
  "Son kullanılanlar:": "Recently used:",

  // ─────────────────────────────────────────────── Kurum, unvan, kartvizit dosyası
  "Şirket / kurum": "Company / organization",
  "Çalıştığı şirket ya da kurum": "Where they work",
  "Örn. Pazarlama Müdürü": "E.g. Marketing Manager",
  "Kartvizit": "Business card",
  "+ Kartvizit ekle": "+ Add business card",
  "Kartvizit (fotoğraf ya da PDF)": "Business card (photo or PDF)",
  "Karttan kaldır": "Remove from card",
  "Kart kaydedildi ama kartvizit yüklenemedi: {sebep}": "The card was saved but the business card couldn't be uploaded: {sebep}",
  "Kartvizit ({n} dosya)": { one: "Business card ({n} file)", other: "Business card ({n} files)" },
  "Dosya açılamadı": "Couldn't open the file",

  // ─────────────────────────────────────────────── Şirket/kurum kişileri, açılır bölüm
  "Kurum ##kartTuru": "Organization",
  "Şirket adı *": "Company name *",
  "Kurum adı *": "Organization name *",
  "+ Kişi ekle": "+ Add person",
  "Web sitesi ve sosyal medya": "Website and social media",
  "dolu": "filled in",

  // ─────────────────────────────────────────────── Satır içi düzenleme, ek dosyalar
  "Düzenleniyor: {ad}": "Editing: {ad}",
  "+ Dosya ekle": "+ Add file",
  "Ek dosyalar": "Attachments",
  "Ek dosyalar (teklif, katalog…)": "Attachments (quotes, catalogs…)",
  "Ek dosyalar ({n}) — son ekleneni açar": "Attachments ({n}) — opens the latest",
  "Kart kaydedildi ama şu dosyalar yüklenemedi: {liste}": "The card was saved but these files couldn't be uploaded: {liste}",
  "{n} kişi kayıtlı": { one: "{n} person registered", other: "{n} people registered" },
  "E-posta gönder": "Send email",
};
