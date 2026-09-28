import type { TranslationDict } from "@projelio/shared";

/** Paket (abonelik) ekranı — bkz. apps/web/src/pages/Billing.tsx. */
export const abonelik: TranslationDict = {
  // ══════════════════════════════════════════════════════ Ödeme öncesi bilgilendirme
  "Bir paket seçtiğinizde aşağıdaki metinleri kabul etmiş olursunuz:":
    "By choosing a plan you accept the following:",
  "Mesafeli Satış Sözleşmesi": "Distance Sales Agreement",
  "İptal ve İade Koşulları": "Cancellation and Refund Policy",

  // ══════════════════════════════════════════════════════ Ekran
  Paketim: "My plan",
  "Paketindeki Lio Bakiyesi her ay yenilenir. Yıllık ödemede 2 ay bedava; bakiye yine her ay yüklenir.":
    "Your plan's Lio Units renew every month. Yearly billing gives you two months free; Lio Units still arrive monthly.",
  "Mevcut paketin": "Your current plan",
  "Bu paketi seç": "Choose this plan",
  "Uygulamada kullanılamıyor": "Not available in the app",

  // Mağaza (Google Play / App Store) satın alma doğrulamasının hata mesajları.
  "Bu mağaza satın alması başka bir Projelio hesabına bağlı.":
    "This store purchase is linked to a different Projelio account.",
  "Google Play satın alması başka bir Projelio hesabına bağlı.":
    "This Google Play purchase is linked to a different Projelio account.",
  "Google Play satın alması bu Projelio hesabıyla eşleşmiyor.":
    "This Google Play purchase doesn't match this Projelio account.",
  "Yeni mağaza satın alma jetonu zaten başka bir aboneliğe bağlı.":
    "The new store purchase token is already linked to another subscription.",
  "Google Play abonelik bitiş tarihini döndürmedi.":
    "Google Play didn't return the subscription's end date.",
  "Google Play bilinmeyen bir abonelik durumu döndürdü.":
    "Google Play returned an unknown subscription state.",
  "Google Play satın alma onayı tamamlanamadı.":
    "The Google Play purchase couldn't be acknowledged.",
  Popüler: "Popular",
  Aylık: "Monthly",
  "Yıllık ödeme": "Pay yearly",
  "2 ay bedava": "2 months free",
  "Yıllık {tutar} olarak faturalanır": "Billed {tutar} yearly",
  "birim / ay": "units / month",
  " / ay": " / mo",
  " / yıl": " / yr",
  "Kartından {tutar} çekilir": "{tutar} will be charged to your card",
  "Bu dönem şu an satın alınamıyor": "This billing period isn't available right now",
  "Kartı güncelle": "Update card",
  "Paketi iptal et": "Cancel plan",
  "Açılıyor…": "Opening…",
  "İptal ediliyor…": "Cancelling…",

  // ══════════════════════════════════════════════════════ Durumlar
  "Ödeme bekleniyor": "Awaiting payment",
  "Deneme sürümü": "Trial",
  Etkin: "Active",
  "Ödeme alınamadı": "Payment failed",
  "Süresi doldu": "Expired",
  "tarihinde yenilenecek": "renews on this date",
  "tarihinde sona erecek": "ends on this date",
  "Son ödeme alınamadı. Erişimin dönem sonuna kadar sürüyor; kartını güncellersen kesinti olmaz.":
    "The last payment failed. Your access continues until the end of the period; updating your card avoids any interruption.",

  // ══════════════════════════════════════════════════════ Sonuç mesajları
  "Paketin etkinleşti. Ayın Lio Bakiyesi hesabına yüklendi.":
    "Your plan is active. This month's Lio Units have been added to your account.",
  "Paketin etkinleşti.": "Your plan is active.",
  "Ödeme henüz onaylanmadı. Birkaç dakika içinde tekrar bak.":
    "The payment hasn't been confirmed yet. Check again in a few minutes.",
  "Ödeme sonucu doğrulanamadı. Destekle iletişime geç.":
    "We couldn't verify the payment result. Please contact support.",
  "Ödeme tamamlanmadı.": "The payment wasn't completed.",
  "Ödeme başlatılamadı.": "Couldn't start the payment.",
  "Kart güncelleme açılamadı.": "Couldn't open the card update form.",
  "İptal edilemedi.": "Couldn't cancel.",
  "Paketin dönem sonuna kadar açık kalacak, sonra ücretsiz plana düşeceksin. İptal edilsin mi?":
    "Your plan stays open until the end of the period, then drops to the free plan. Cancel it?",
  "Paketin iptal edildi. Dönem sonuna kadar kullanmaya devam edebilirsin.":
    "Your plan is cancelled. You can keep using it until the end of the period.",

  // ══════════════════════════════════════════════════════ Uyarılar
  "Demo hesabında paket satın alınamaz. Kendi hesabını açarsan paketler açılır.":
    "Plans can't be purchased on the demo account. Open your own account to unlock them.",
  "Ödeme sistemi henüz açılmadı. Paketler yakında satın alınabilir olacak.":
    "Payments aren't live yet. Plans will be available for purchase soon.",
  "Ödeme sistemi test modunda çalışıyor; gerçek tahsilat yapılmaz.":
    "Payments are running in test mode; no real charge is made.",
  "Bu paket App Store üzerinden alınmış; değişiklikler Ayarlar > Abonelikler'den yapılır.":
    "This plan was bought through the App Store; manage it in Settings > Subscriptions.",
  "Bu paket Google Play üzerinden alınmış; değişiklikler Play Store > Abonelikler'den yapılır.":
    "This plan was bought through Google Play; manage it in Play Store > Subscriptions.",
  "Bu paket elle tanımlanmış; değişiklik için destekle iletişime geç.":
    "This plan was set up manually; contact support to change it.",

  // ══════════════════════════════════════════════════════ Paket özellikleri
  // Katalogdan (backend billing.plans.ts) geldikleri için metinler orada yazılı.
  "Aylık 20.000 birim Lio Bakiyesi": "20,000 Lio Units per month",
  "Aylık 50.000 birim Lio Bakiyesi": "50,000 Lio Units per month",
  "Aylık 150.000 birim Lio Bakiyesi": "150,000 Lio Units per month",
  "Sınırsız proje ve görev": "Unlimited projects and tasks",
  "Google Drive / OneDrive bağlantısı": "Google Drive / OneDrive connection",
  "E-posta desteği": "Email support",
  "Starter'daki her şey": "Everything in Starter",
  "Pro'daki her şey": "Everything in Pro",
  "WhatsApp üzerinden Lio": "Lio over WhatsApp",
  "Gelir-gider ve proje bütçesi": "Income, expenses and project budgets",
  "Öncelikli destek": "Priority support",
  "10 kullanıcıya kadar": "Up to 10 users",
  "Departman bazlı yetkilendirme": "Department-level permissions",
  "Dışa aktarma ve raporlar": "Exports and reports",

  // ══════════════════════════════════════════════════════ Yönetici paneli
  "Paketler ve ödeme": "Plans and payments",
  "Paketlerin sağlayıcıdaki karşılığı. TL tutarlar aşağıdaki kurdan hesaplanır; kur kaydedilince hepsi birlikte güncellenir ve bir sonraki ödemeden itibaren geçerli olur.":
    "How each plan maps to the provider. TRY amounts are calculated from the rate below; saving the rate updates them all at once, effective from the next payment.",
  "Ödeme planı referans kodu": "Pricing plan reference code",
  "Mağaza ürün kimliği": "Store product id",
  "Kurdan hesaplanır": "Calculated from the rate",
  "Kaydedince: {tutar} ₺": "After saving: ₺{tutar}",
  "Kur kaydedildi, TL tutarlar yeniden hesaplandı.": "Rate saved, TRY amounts recalculated.",
  "Mağaza belirler": "Set by the store",
  "USD/TRY kuru — kaydedince TL tutarlar USD × kur ile hesaplanıp 10 ₺'ye yukarı yuvarlanır":
    "USD/TRY rate — saving it recalculates TRY amounts as USD × rate, rounded up to the next ₺10",
  TCMB: "CBRT",
  "efektif satış": "banknote selling",
  "döviz satış": "forex selling",
  "Bu kuru yaz": "Use this rate",
  "Kayıtlı kur güncelin %{oran} gerisinde — güncel kuru yazıp kaydet.":
    "The saved rate is {oran}% behind the current one — enter the current rate and save.",
  Abonelikler: "Subscriptions",
  "Henüz abonelik yok.": "No subscriptions yet.",
  Yıllık: "Yearly",

  // ══════════════════════════════════════════════════════ PayTR kart formu ve abonelik
  "Kart üzerindeki ad": "Name on card",
  "Yıl (2 hane)": "Year (2 digits)",
  "Bekleyen dönem ödemesi: {tutar}. Bu kart sonraki yenilemelerde de kullanılır.": "Outstanding period payment: {tutar}. This card will also be used for future renewals.",
  "Kart bilgilerin Projelio'ya gelmez; ödeme PayTR üzerinden 3D Secure ile alınır.": "Your card details never reach Projelio; the payment is taken through PayTR with 3D Secure.",
  "Kart numarası": "Card number",
  "Kart numarası, boşluksuz 15–16 rakam": "Card number, 15–16 digits without spaces",
  "Kartı değiştir": "Change card",
  "Kartı doğrula": "Verify card",
  "Kartımın PayTR'de saklanmasını ve aboneliğimin iptal edene kadar her dönem bu karttan otomatik yenilenmesini kabul ediyorum.": "I agree that my card is stored at PayTR and that my subscription renews automatically from this card every period until I cancel.",
  "Kartın güncellendi. Doğrulama için çekilen 1 ₺ iade ediliyor.": "Your card has been updated. The 1 TL verification charge is being refunded.",
  "Kartını doğrulamak için 1 ₺ çekilir ve hemen iade edilir. Sonraki yenilemeler bu karttan yapılır.": "1 TL is charged to verify your card and refunded right away. Future renewals will use this card.",
  "Son ödeme alınamadı. Paketin açık; ödemeyi birkaç gün boyunca yeniden deneyeceğiz. Hemen ödemek ya da başka bir kart kullanmak için aşağıdaki düğmeye bas.": "The last payment didn't go through. Your plan is still active; we'll retry over the next few days. Use the button below to pay now or use a different card.",
  "{donem} ödeme: {tutar}. Bir sonraki dönem aynı karttan otomatik yenilenir; istediğin zaman iptal edebilirsin.": "{donem} payment: {tutar}. The next period renews automatically from the same card; you can cancel any time.",
  "{plan} paketine geç": "Switch to {plan}",
  "Öde": "Pay",
  "Ödeme kartını değiştir": "Change payment card",
  "Ödeme onayı gecikiyor. Birkaç dakika sonra sayfayı yenile; sorun sürerse destekle iletişime geç.": "Payment confirmation is taking longer than usual. Refresh the page in a few minutes; if it persists, contact support.",
  "Ödeme tamamlanmadı. Kartından para çekilmedi; tekrar deneyebilirsin.": "The payment wasn't completed. Your card wasn't charged; you can try again.",
  "Ödemen PayTR'den onay bekliyor…": "Waiting for PayTR to confirm your payment…",
  "Ödemen alındı, paketin etkin. Makbuz e-posta adresine gönderildi.": "Payment received, your plan is active. A receipt has been sent to your email.",
  "Ödemeyi şimdi yap": "Pay now",
  // ══════════════════════════════════════════════════════ İndirim kodları
  "Abonelik + Lio Bakiyesi": "Subscription + Lio Units",
  "Abonelikte süre": "Duration on subscriptions",
  "Açıklama (yalnızca sen görürsün)": "Note (only you can see it)",
  "Dönem:": "Period:",
  "Henüz indirim kodu yok.": "No discount codes yet.",
  "Her yenilemede geçerli": "Applies to every renewal",
  "Kod": "Code",
  "Kod oluşturulamadı.": "Couldn't create the code.",
  "Kodu müşteri ödeme formunda girer. İndirimli tutar 1 ₺'nin altına inmez. Oluşturulan kodun değeri değiştirilemez, yalnızca kapatılabilir.": "Customers enter the code on the payment form. The discounted amount never drops below 1 TL. A created code's value can't be changed; it can only be turned off.",
  "Kodu oluştur": "Create code",
  "Nerede geçerli": "Valid for",
  "Paket sınırı (boşsa hepsi):": "Plan limit (all if empty):",
  "Sabit tutar (₺)": "Fixed amount (TL)",
  "Son tarih (isteğe bağlı)": "End date (optional)",
  "Toplam kullanım sınırı (isteğe bağlı)": "Total usage limit (optional)",
  "Uygula": "Apply",
  "Yalnızca ilk ödeme": "First payment only",
  "Yalnızca ilk ödemede geçerli": "Applies to the first payment only",
  "Yüzde (%)": "Percentage (%)",
  "abonelik": "subscription",
  "abonelik + Lio": "subscription + Lio",
  "ilk {n} ödeme": "first {n} payments",
  "ilk ödeme": "first payment",
  "kullanım": "uses",
  "son": "ends",
  "süresiz": "no end",
  "Ödeme sayısı": "Number of payments",
  "İlk N ödeme": "First N payments",
  "İlk {n} ödemede geçerli": "Applies to the first {n} payments",
  "İndirim (%)": "Discount (%)",
  "İndirim (₺)": "Discount (TL)",
  "İndirim kodları": "Discount codes",
  "İndirim kodu": "Discount code",
  "İndirim kodu kontrol edilemedi.": "Couldn't check the discount code.",
  "İndirim kodu oluşturuldu.": "Discount code created.",
  "İndirim kodun var mı?": "Have a discount code?",
  "Dönem bakımını çalıştır": "Run period maintenance",
  "Dönem bakımı çalıştı: {denenen} yenileme denendi, {kredi} aylık bakiye yüklendi, {biten} abonelik kapandı.": "Period maintenance ran: {denenen} renewals attempted, {kredi} monthly balances loaded, {biten} subscriptions closed.",
  "Dönem bakımı çalıştırılamadı.": "Couldn't run period maintenance.",
};
