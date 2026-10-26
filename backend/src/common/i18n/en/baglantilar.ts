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
  "Geçersiz aktarım hedefi": "Invalid transfer target",
  "Arşivdeki kart aktarılamaz": "An archived card can't be transferred",
  "Bu kart o modüle zaten aktarılmış": "This card has already been transferred to that module",
  "Hedef modül burada açık değil": "The target module isn't enabled here",
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
  // Görüşme notları (migration 160)
  "Geçersiz not türü": "Invalid note type",
  "Not bulunamadı": "Note not found",
  "Bu kayıt otomatik oluşturuldu, değiştirilemez": "This entry was created automatically and can't be changed",
  "Yalnızca kendi notunu değiştirebilirsin": "You can only change your own notes",
  "Tedarik modülü burada açık değil": "The Procurement module isn't enabled here",
  // Bağlantı listeleri (migration 163)
  "Bağlantı listelerini değiştirme yetkin yok": "You don't have permission to change contact lists",
  "Bir seferde en çok 2000 kart eklenebilir": "At most 2000 cards can be added at once",
  "Bu adla bir liste zaten var": "A list with this name already exists",
  "Liste adı gerekli": "List name is required",
  "Liste bulunamadı": "List not found",

  // Müşteri listeleri ve özel sıra (migration 170)
  "Müşteri listelerini değiştirme yetkin yok": "You don't have permission to change customer lists",
  "Müşterileri görme yetkin yok": "You don't have permission to view customers",
  "Bir seferde çok fazla kart gönderildi": "Too many cards were sent at once",
  "Geçersiz sıra anahtarı": "Invalid order key",
  "Bu kaynak kartın şirketine ait değil": "This source doesn't belong to the card's company",
  "Dosya seçilmedi": "No file selected",
};
