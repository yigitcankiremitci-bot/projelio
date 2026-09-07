import type { TranslationDict } from "@projelio/shared";

/** Paket (abonelik) ekranı — bkz. apps/web/src/pages/Billing.tsx. */
export const abonelik: TranslationDict = {
  // ══════════════════════════════════════════════════════ Ekran
  Paketim: "My plan",
  "Paketindeki krediler her ay yenilenir. Yıllık ödemede iki ay bedava; krediler yine her ay yüklenir.":
    "Your plan's credits renew every month. Yearly billing gives you two months free; credits still arrive monthly.",
  "Mevcut paketin": "Your current plan",
  "Bu paketi seç": "Choose this plan",
  Popüler: "Popular",
  Aylık: "Monthly",
  "Yıllık — 2 ay bedava": "Yearly — 2 months free",
  "kredi / ay": "credits / month",
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
  "Paketin etkinleşti. Ayın kredisi hesabına yüklendi.":
    "Your plan is active. This month's credits have been added to your account.",
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
  "Aylık 20.000 Lio kredisi": "20,000 Lio credits per month",
  "Aylık 50.000 Lio kredisi": "50,000 Lio credits per month",
  "Aylık 150.000 Lio kredisi": "150,000 Lio credits per month",
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
  "Paketlerin sağlayıcıdaki karşılığı. Buradaki tutar, sağlayıcıdaki planda yazan tutarla birebir aynı olmalı — ayrışırsa kullanıcıya gösterilen fiyatla çekilen tutar farklı olur.":
    "How each plan maps to the provider. The amount here must match the provider's plan exactly — if they drift apart, the price shown and the amount charged will differ.",
  "Ödeme planı referans kodu": "Pricing plan reference code",
  "Mağaza ürün kimliği": "Store product id",
  "Tahsilat tutarı (₺)": "Charge amount (₺)",
  "Mağaza belirler": "Set by the store",
  "Vitrinde gösterilen USD/TRY kuru (tahsilatta kullanılmaz)":
    "USD/TRY rate shown on the site (not used for charging)",
  Abonelikler: "Subscriptions",
  "Henüz abonelik yok.": "No subscriptions yet.",
  Yıllık: "Yearly",
};
