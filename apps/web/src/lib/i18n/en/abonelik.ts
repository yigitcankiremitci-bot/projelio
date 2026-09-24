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

  // ══════════════════════════════════════════════════════ Admin: PayTR kart saklama denemesi
  "PayTR kart saklama denemesi": "PayTR card storage test",
  "Kendi kartınla küçük bir 3D'li ödeme yapıp kartı PayTR'de saklar, ardından kartın CVV isteyip istemediğini (require_cvv) ve saklı karttan Non3D çekimi dener. Çekilen tutarı PayTR panelinden iade edebilirsin.":
    "Makes a small 3D Secure payment with your own card and stores the card at PayTR, then checks whether the card requires CVV (require_cvv) and tries a Non3D charge on the saved card. You can refund the amount from the PayTR panel.",
  "Test modu: gerçek para çekilmez.": "Test mode: no real money is charged.",
  "Canlı mod: karttan gerçekten para çekilir.": "Live mode: the card is actually charged.",
  "PayTR'den döndün. Sonuç bildirimle gelir; birkaç saniye sonra Yenile'ye bas.":
    "You're back from PayTR. The result arrives via notification; press Refresh in a few seconds.",
  "PayTR ödemeyi başarısız olarak döndürdü.": "PayTR returned the payment as failed.",
  "Durum alınamadı.": "Couldn't load the status.",
  "Tutar (TL, 1–50)": "Amount (TL, 1–50)",
  "Kart formunu aç": "Open card form",
  "Kart üzerindeki ad": "Name on card",
  "Kart numarası (boşluksuz)": "Card number (no spaces)",
  "Yıl (2 hane)": "Year (2 digits)",
  "3D ile öde ve kartı sakla": "Pay with 3D Secure and save card",
  "Son PayTR bildirimi": "Latest PayTR notification",
  "Kart saklama": "Card storage",
  "Non3D çekim": "Non3D charge",
  "utoken geldi.": "utoken received.",
  "utoken GELMEDİ.": "utoken NOT received.",
  Alanlar: "Fields",
  "PayTR'de saklı kart yok.": "No saved cards at PayTR.",
  "CVV istiyor, gözetimsiz yenileme yapılamaz": "requires CVV, unattended renewal isn't possible",
  "gözetimsiz yenileme mümkün": "unattended renewal is possible",
  "Non3D çekim dene": "Try Non3D charge",
  "Non3D çekim yanıtı: {durum}": "Non3D charge response: {durum}",
  "yeniden denenebilir": "can be retried",
  "Bu kart PayTR'den silinsin mi?": "Delete this card from PayTR?",
};
