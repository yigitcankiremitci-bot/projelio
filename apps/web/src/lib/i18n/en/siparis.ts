import type { TranslationDict } from "@projelio/shared";

/**
 * Sipariş aşaması, B2B web portalı ve ürün içe aktarımında güncelleme
 * (migration 187-188, 2026-11-09).
 */
export const siparis: TranslationDict = {
  // ─────────────────────────────────────────────── Aşama
  "Alındı": "Received",
  "Sipariş aşaması": "Order stage",
  "Sipariş onaylanınca ürünlerin stoğu düşer. Devam edilsin mi?": "Approving the order deducts the products from stock. Continue?",
  "Sipariş iptal edilince düşen stok geri eklenir. İptal geri alınamaz. Devam edilsin mi?":
    "Cancelling the order adds the deducted stock back. Cancellation can't be undone. Continue?",
  "Sipariş iptal edilsin mi? İptal geri alınamaz.": "Cancel the order? Cancellation can't be undone.",
  "Onaylanan siparişin ürünleri ve adetleri kilitli; fiyat ve diğer bilgiler değiştirilebilir.":
    "Products and quantities of an approved order are locked; price and other details can still be changed.",
  "Sipariş zaten bu aşamada": "The order is already at this stage",
  "İptal edilen sipariş yeniden açılamaz": "A cancelled order can't be reopened",
  "Onaylanan sipariş Alındı'ya geri alınamaz; gerekiyorsa iptal edin": "An approved order can't go back to Received; cancel it if needed",

  // ─────────────────────────────────────────────── Web portalı
  "Web portalı": "Web portal",
  "Müşteri iskontosu (%)": "Customer discount (%)",
  "İskonto oranı 0 ile 100 arasında olmalı": "Discount rate must be between 0 and 100",
  "İskonto KDV hariç liste fiyatına uygulanır, sonra KDV eklenir. Portal fiyatı sunucudan hesaplanmış alır.":
    "The discount applies to the list price excluding VAT, then VAT is added. The portal receives the price calculated by the server.",
  "Bu müşterinin henüz portal hesabı yok.": "This customer has no portal account yet.",
  "Sipariş verebilir": "Can place orders",
  "Fiyat görebilir": "Can see prices",
  "Sipariş geçmişini görebilir": "Can see order history",
  "Hesabı kapat": "Close account",
  "Yeniden aç": "Reopen",
  "Portal hesabı kapatılsın mı? Kişi portala giremez.": "Close this portal account? The person won't be able to sign in to the portal.",
  "+ Portal kullanıcısı oluştur": "+ Create portal user",
  "Portal hesabı aç": "Open portal account",
  "Web portalı · {n} hesap": "Web portal · {n} accounts",
  "Bu müşteri portalda görünmüyor; hesap açılınca görünür.": "This customer isn't on the portal yet; it appears once an account is opened.",
  "Ad (isteğe bağlı)": "Name (optional)",
  "Şifre Projelio'da tutulmaz: portal bu adrese şifre belirleme e-postası gönderir.":
    "Passwords aren't stored in Projelio: the portal sends a set-password email to this address.",
  "Hesabı oluştur": "Create account",

  // ─────────────────────────────────────────────── Ürün içe aktarımı
  "Stok kodu aynı olan mevcut ürünleri güncelle": "Update existing products with the same SKU",
  "Stok adedini de dosyadakiyle değiştir": "Also replace stock quantity with the file's",
  "{n} ürün güncellendi.": "{n} products updated.",
  "{n} ürün stok koduyla eşleşti, stok dahil güncellenecek.": "{n} products matched by SKU and will be updated, including stock.",
  "{n} ürün stok koduyla eşleşti, stok hariç güncellenecek.": "{n} products matched by SKU and will be updated, excluding stock.",
  "{n} ekle, {m} güncelle": "Add {n}, update {m}",
  "{n} ürünü güncelle": "Update {n} products",

  // ─────────────────────────────────────────────── Tahsilat takibi (2026-11-11)
  "Sipariş ya da müşteri ara…": "Search orders or customers…",
  "Aramayı ve filtreleri temizle": "Clear search and filters",
  "Açık siparişlerin hepsini seç": "Select all open orders",
  "Tutar · vade": "Amount · due",
  "Bugün vadeli": "Due today",
  "{n} gün gecikti": "{n} days overdue",
  "{n} gün kaldı": "{n} days left",
  "Henüz tahsilat yok.": "No payments yet.",
  "Faturasız": "Not invoiced",
  "Faturası kesilmemiş": "Not invoiced yet",
  "Vadesi 7 gün içinde": "Due within 7 days",
  "Excel'den aktar": "Import from Excel",
  "Raporlar": "Reports",
  "Çalışan bazında": "By employee",
  "Bir sipariş seç": "Select an order",
  "Evrak no": "Document no.",
  "Evrak vadesi": "Document due date",
  "Listeden bir siparişe tıkla; tahsilatları, faturası ve ürünleri burada açılır.": "Click an order in the list; its payments, invoice and products open here.",
  "Sipariş ayrıntısı": "Order details",
  "Sipariş bilgileri": "Order information",
  "Vade": "Due date",
  "{gun} gün": "{gun} days",
};
