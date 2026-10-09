import type { TranslationDict } from "@projelio/shared";

/**
 * Bağlantı ve İlişkiler modülünün sunucu metinleri (istisna mesajları).
 * Kayda bağlı yetki kararları: party/baglanti-erisim.ts, party.service.ts.
 */
export const baglantilar: TranslationDict = {
  "Bağlantı bilgilerini yalnızca Bağlantı ve İlişkiler modülünde yazar olanlar değiştirebilir":
    "Only people with write access to Contacts & Relationships can change connection details",
  "Bu kart Bağlantı ve İlişkiler'de değil": "This card isn't in Contacts & Relationships",
  "Bu kart Müşteriler'de değil": "This card isn't in Customers",
  "Bu kaydı değiştirme yetkin yok": "You don't have permission to change this record",
  "Farklı kapsamlardaki kayıtlar birleştirilemez": "Records from different scopes can't be merged",
  "Geçersiz rol": "Invalid role",
  "Geçersiz önem": "Invalid priority",
  "Kaydı başka birine yalnızca yönetici atayabilir": "Only a manager can assign the record to someone else",
  "Tarih YYYY-AA-GG biçiminde olmalı": "Date must be in YYYY-MM-DD format",

  // Defterler arası geçiş ("Müşteri yap" / "Bağlantılara ekle")
  "Arşivdeki kart başka bir deftere eklenemez": "An archived card can't be added to another list",
  "Bağlantı ve İlişkiler modülü burada açık değil": "The Contacts & Relationships module isn't enabled here",
  "Müşteriler modülü burada açık değil": "The Customers module isn't enabled here",
  "Kartı bu deftere eklemek için orada da yazma yetkin olmalı": "You need write access there too to add the card to that list",

  "Geçersiz sosyal hesap": "Invalid social media account",
  "Geçersiz kart türü": "Invalid card type",
  "Geçersiz dosya rolü": "Invalid file role",
  "Departman bu kartın şirketinde değil": "That department isn't in this card's company",
  "Dosya eklemek için kartı modülün açık olduğu bir departmandan aç":
    "To add a file, open the card from a department where the module is enabled",
  "Kartvizit fotoğraf ya da PDF olmalı": "The business card must be a photo or a PDF",

  // Lio: kartvizitten bağlantı (taslak → onay)
  "Eklenecek kişi yok": "No one to add",
  "Bu dosya görsel ya da kişi kartı (.vcf) değil.": "This file isn't an image or a contact card (.vcf).",
  "Dosya bulunamadı ya da süresi doldu. Kullanıcıdan yeniden göndermesini iste.": "File not found or expired. Ask the user to send it again.",
  "{n} bağlantı eklendi": { one: "{n} contact added", other: "{n} contacts added" },
  "Bağlantı ve İlişkiler'i görme yetkin yok": "You don't have access to Contacts & Relationships",
  "Bağlantı ve İlişkiler modülü hiçbir şirketinde açık değil. Kullanıcıdan modülü bir departmana eklemesini iste.":
    "Contacts & Relationships isn't enabled in any of your companies. Ask the user to add the module to a department.",
  "Taslak bulunamadı ya da süresi doldu. prepare_connections'ı yeniden çağır.":
    "Draft not found or expired. Call prepare_connections again.",
  "Taslak kullanıcıya henüz gösterilmedi. Özeti göster, rolü sor ve kullanıcının cevabını bekle; onay aynı turda verilemez.":
    "The draft hasn't been shown to the user yet. Show the summary, ask for the role and wait for the user's reply; it can't be confirmed in the same turn.",
  "{hesap} hesabı tanınmadı": "{hesap} account not recognized",
};
