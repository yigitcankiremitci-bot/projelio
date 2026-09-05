import type { TranslationDict } from "@projelio/shared";

/**
 * Lio paneli, kredi ekranları ve yönetici AI ayarları.
 *
 * "Lio" ürün adıdır, çevrilmez. Kredi/para terimleri tutarlı olmalı:
 * credit, balance, top-up, order, usage, tier, provider, model.
 */
export const lio: TranslationDict = {
  // ─────────────────────────────────────────────── Panel
  "Lio'yu aç": "Open Lio",
  "Ses ayarları": "Voice settings",
  "Sohbet geçmişi": "Chat history",
  "Sohbet yükleniyor…": "Loading conversation…",
  "Henüz sohbet yok.": "No conversations yet.",
  "Sohbette açık:": "Open in this chat:",
  "Tarayıcı sesi · ücretsiz": "Browser voice · free",
  "(her yanıt kredi harcar)": "(each reply costs credits)",
  "Çalışıyor": "Working",
  "Çalışıyor…": "Working…",
  "İşleniyor…": "Processing…",
  "okunuyor…": "reading…",
  "Yükleniyor…": "Loading…",
  "Sonuç yok.": "No results.",
  " · görsel okuyabilir": " · can read images",
  "· şu an kullanılan": "· currently in use",

  // ─────────────────────────────────────────────── Dosya ekleme
  "Dosyaları bırak": "Drop files here",
  "Dosyayı çıkar": "Remove file",
  "Dosyayı önizle": "Preview file",
  "Dosya okunamadı.": "Could not read the file.",
  "Bilgisayardan yükle": "Upload from computer",
  "Drive / OneDrive'dan seç": "Pick from Drive / OneDrive",
  "OneDrive'dan seç": "Pick from OneDrive",
  "Fotoğraf çek": "Take a photo",
  "Bu klasör boş.": "This folder is empty.",

  // ─────────────────────────────────────────────── Devam onayı
  "Devam edeyim mi?": "Should I continue?",
  "Devam et": "Continue",
  "Dur, yeter": "Stop here",
  "Onaylıyorum, yap": "Yes, go ahead",
  "Bu istek pahalı görünüyor": "This request looks expensive",
  "Bu isteği yapmaya başlamadan önce onayını almak istedim; tahmini bedeli yüksek.":
    "I wanted your go-ahead before starting: the estimated cost is high.",
  "Bu istek adım sınırına geldi ama henüz bitmedi.": "This request hit the step limit but isn't finished yet.",
  "Bu istek beklediğimden uzun sürdü ve kredi eşiğine geldi.":
    "This request took longer than I expected and reached the credit threshold.",
  "Bu istek boyunca tekrar sorma": "Don't ask again during this request",
  "Kredi biterse yine durulur; bu seçenek yalnızca onay pencerelerini kapatır.":
    "It still stops if you run out of credit; this only turns off the confirmation prompts.",
  "Tahmini bedel": "Estimated cost",
  "Devam edersem (adım başına)": "If I continue (per step)",
  "~{n} kredi": { one: "~{n} credit", other: "~{n} credits" },

  // ─────────────────────────────────────────────── Krediler (kullanıcı)
  "AI Kredilerim": "My AI credits",
  "Lio kredisi": "Lio credit",
  "Projelio Kredisi": "Projelio Credit",
  "Lio kredilerin — kredi sayfasını aç": "Your Lio credits — open the credits page",
  "Lio kredin azaldı — kredi sayfasını aç": "Your Lio credit is running low — open the credits page",
  "Lio kredisi: {bakiye}. Kredi sayfasını aç.": "Lio credit: {bakiye}. Open the credits page.",
  "Krediniz azaldı. Asistanı kesintisiz kullanmak için aşağıdan kredi yükleyebilirsiniz.":
    "You're running low on credit. Top up below to keep using the assistant without interruption.",
  "Kredi yükle": "Top up credit",
  "Krediyi yükle": "Add the credit",
  "Kredi yüklenemedi.": "Could not add the credit.",
  "Kredi miktarı": "Credit amount",
  "Geçerli bir kredi miktarı gir.": "Enter a valid credit amount.",
  "Kredi paketleri yüklenemedi. Sayfayı yenilemeyi dene.":
    "Could not load the credit packages. Try refreshing the page.",
  "{n} kredi": { one: "{n} credit", other: "{n} credits" },
  Bakiye: "Balance",
  Hareketler: "Activity",
  "Henüz hareket yok.": "No activity yet.",
  "Harcanan kredi": "Credits spent",
  "Şimdiye kadar harcanan": "Spent so far",
  "Şimdiye kadar yapılan": "Done so far",
  "Ömür boyu harcanan": "Spent all-time",
  "Ömür boyu yüklenen": "Topped up all-time",
  "Demo hesabındasın: Lio ücretsiz, krediden düşmüyor. Yukarıdaki sayı, bütün ziyaretçilerin paylaştığı saatlik deneme hakkından kalan kısım — dolarsa bir süre sonra kendiliğinden yenileniyor. Kendi hesabında böyle bir sınır yok.":
    "You're in the demo account: Lio is free here and costs no credit. The number above is what's left of an hourly trial allowance shared by all visitors — if it runs out it refills on its own after a while. Your own account has no such limit.",

  // ─────────────────────────────────────────────── Siparişler
  "Kredi siparişleri": "Credit orders",
  "Sipariş oluştur": "Create order",
  "Sipariş oluşturulamadı.": "Could not create the order.",
  "Sipariş iptal edilemedi.": "Could not cancel the order.",
  "Siparişler yüklenemedi.": "Could not load the orders.",
  "Bekleyen siparişlerin": "Your pending orders",
  "Ödeme bekleyen sipariş yok.": "No orders awaiting payment.",
  "Ödemeye geç": "Go to payment",
  "Ödemeyi onayla": "Confirm payment",
  "Ödemesi alınan siparişi onayla — kredi ancak onaydan sonra kullanıcının bakiyesine geçer.":
    "Confirm an order that has been paid — the credit reaches the user's balance only after confirmation.",
  "Ödemesi onaylanmış ama kredisi yüklenememiş sipariş var. Yükleme yeniden denenmeli.":
    "There is an order whose payment is confirmed but whose credit could not be added. The top-up needs retrying.",
  "Çevrim içi ödeme henüz açık değil. Siparişi oluşturduğunda ödeme talimatları için seninle iletişime geçilir; ödeme onaylandıktan sonra kredilerin hesabına yüklenir.":
    "Online payment isn't available yet. Once you create the order we'll get in touch with payment instructions; your credits are added after the payment is confirmed.",
  "Tamamlanan yüklemelerin aşağıdaki hareketler listesinde.": "Completed top-ups are in the activity list below.",

  // ─────────────────────────────────────────────── Yönetici: kredi
  "AI kredi yönetimi": "AI credit management",
  "Kullanıcılar": "Users",
  "Kullanıcı": "User",
  "Kullanıcı listesi yüklenemedi.": "Could not load the user list.",
  "İsim veya kullanıcı adı ara…": "Search by name or username…",
  "Ada, kullanıcı adına veya e-postaya göre filtrele…": "Filter by name, username or email…",
  "{ad} hesabına {kredi} kredi yüklendi. Yeni bakiye: {bakiye}.":
    "{kredi} credits added to {ad}. New balance: {bakiye}.",
  "Not (opsiyonel)": "Note (optional)",
  "Açıklama (opsiyonel)": "Description (optional)",
  "Ör. Ocak ayı paketi": "e.g. January package",
  "Ör. Ağustos yüklemesi": "e.g. August top-up",
  "Ör. 0.55": "e.g. 0.55",

  // ─────────────────────────────────────────────── Yönetici: Anthropic bakiyesi
  "Anthropic bakiyesi": "Anthropic balance",
  "Anthropic maliyeti": "Anthropic cost",
  "Anthropic'e yükledim": "I topped up Anthropic",
  "Kalan kredi": "Credit remaining",
  "Kullanılabilir bakiye": "Available balance",
  "Kullanılan (gerçek maliyet)": "Used (actual cost)",
  "Toplam yüklenen": "Total topped up",
  "Toplam harcanan": "Total spent",
  "Yüklenen (ömür boyu)": "Topped up (all-time)",
  "Yüklenen tutar (USD)": "Amount topped up (USD)",
  "Kullanıcıya yansıyan": "Charged to users",
  "Brüt kâr": "Gross margin",
  "İstek başı maliyet": "Cost per request",
  "İstek başı kredi": "Credits per request",
  "Bu rakamla eşitle": "Reconcile with this figure",
  'Console\'daki gerçek "Total cost" ($)': 'Actual "Total cost" from the Console ($)',
  "Geçerli bir tutar gir.": "Enter a valid amount.",
  "Geçerli bir tutar gir (Console > Cost sayfasındaki toplam).":
    "Enter a valid amount (the total from Console > Cost).",
  "${tutar} kaydedildi. Kalan bakiye: {bakiye} kredi karşılığı.":
    "${tutar} saved. Remaining balance: {bakiye} credits' worth.",
  "Referans nokta ${tutar} olarak kaydedildi.": "Reference point saved as ${tutar}.",
  '"Kalan kredi", Anthropic\'e yüklediğin gerçek bakiyenin ne kadarının kaldığını, aşağıdaki kullanıcı kredisi ile aynı birimde gösterir — kullanıcılara ne kadar kredi dağıtabileceğine karar vermek için buna bak. Anthropic konsolunda bakiye yükledikçe aşağıdan buraya ekle.':
    '"Credit remaining" shows how much of the real balance you topped up at Anthropic is left, in the same unit as the user credit below — use it to decide how much credit you can hand out. Add each Anthropic console top-up here from the field below.',
  '"Kullanılan" rakamı doğrudan Anthropic\'in Cost Report API\'sinden geliyor (gerçek fatura). Kendi token bazlı tahminimiz: ${tahmin}.':
    '"Used" comes straight from Anthropic\'s Cost Report API (the real bill). Our own token-based estimate is ${tahmin}.',
  '"Kullanılan" rakamı şu an kendi token bazlı tahminimiz (${tahmin}) — Anthropic\'in gerçek verisine bağlanmak için backend/.env\'e':
    '"Used" is currently our own token-based estimate (${tahmin}) — to connect Anthropic\'s real figures, add to backend/.env',
  '"Kullanılan" rakamı, {tarih} tarihinde Console\'dan girdiğin ${tutar} referans noktası + o tarihten sonraki kendi tahminimiz. Yeni bir referans noktası girersen bunun üzerine yazılır.':
    '"Used" is the ${tutar} reference point you entered from the Console on {tarih}, plus our own estimate since that date. Entering a new reference point overwrites it.',
  "eklenmeli, ya da aşağıdan Console'daki gerçek rakamla elle eşitleyebilirsin.":
    ", or you can reconcile it by hand with the Console's actual figure below.",
  "Bu tutarlar, Anthropic'in her yanıtta bildirdiği gerçek token sayılarından hesaplanır. Doğrulamak için console.anthropic.com'daki kullanım ekranıyla karşılaştırın; ciddi bir fark varsa fiyat tablosu güncellenmelidir.":
    "These amounts are computed from the real token counts Anthropic reports with every response. To verify, compare them with the usage screen at console.anthropic.com; a significant gap means the pricing table needs updating.",
  "10.000 kredi ≈ 1 USD satış bedeli (%20 komisyon dahil) ≈ 70 asistan işlemi.":
    "10,000 credits ≈ 1 USD list price (20% commission included) ≈ 70 assistant operations.",
  "Son {gun} gün · {istek} istek · %{komisyon} komisyon":
    "Last {gun} days · {istek} requests · {komisyon}% commission",

  // ─────────────────────────────────────────────── Yönetici: sağlayıcı ve model
  "AI sağlayıcıları": "AI providers",
  "Birincil sağlayıcı": "Primary provider",
  "Kademe ve model seçimi": "Tier and model selection",
  "Herkesin kullandığı kademe": "Tier everyone uses",
  "Varsayılan kademe güncellendi.": "Default tier updated.",
  "{kademe} kademesinde çalışacak model": "Model to run on the {kademe} tier",
  "Kullanılan model": "Model in use",
  "Varsayılan ({model})": "Default ({model})",
  "{n} model": { one: "{n} model", other: "{n} models" },
  "Model güncellendi.": "Model updated.",
  "Model kaydedilemedi.": "Could not save the model.",
  "Bu kararlar tüm kullanıcılar için geçerlidir; kullanıcılar model seçemez.":
    "These decisions apply to every user; users cannot pick a model themselves.",
  "Sıra öncelik demektir: birincil sağlayıcı geçici olarak yanıt vermezse (hız sınırı, sunucu hatası, bağlantı) istek sıradakine devredilir ve kredi gerçekten kullanılan modelin fiyatından kesilir. Sağlayıcı açıp kapatmak ya da sırayı değiştirmek için sunucudaki":
    "Order means priority: if the primary provider is temporarily unavailable (rate limit, server error, connection), the request falls through to the next one and credit is charged at the price of the model actually used. To enable, disable or reorder providers, edit the",
  "değişkenini düzenle.": "variable on the server.",
  "Anahtar yok": "No key",
  Etkin: "Enabled",
  "Erişim": "Access",
  "Ulaşılamıyor": "Unreachable",

  // ─────────────────────────────────────────────── Ortak
  "Değiştir": "Change",
  "İptal": "Cancel",
  "Kaydedilemedi.": "Could not be saved.",
  "İşlem tamamlanamadı.": "The operation could not be completed.",
};
