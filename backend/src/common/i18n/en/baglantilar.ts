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
  "{hesap} hesabı tanınmadı": "{hesap} account not recognized",
};
