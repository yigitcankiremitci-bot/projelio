import type { TranslationDict } from "@projelio/shared";

/**
 * Lio paneli, Lio Bakiyesi ekranları ve yönetici AI ayarları.
 *
 * "Lio" ürün adıdır, çevrilmez. Bakiye/para terimleri tutarlı olmalı:
 * Lio Units (asla "credit" değil — ödeme kuruluşu reddetti), balance, top-up, order, usage, tier, provider, model.
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
  "(her yanıt Lio Bakiyesi harcar)": "(each reply uses Lio Units)",
  "Çalışıyor": "Working",
  "Çalışıyor…": "Working…",
  "İşleniyor…": "Processing…",
  "okunuyor…": "reading…",
  "Yükleniyor…": "Loading…",
  " · görsel okuyabilir": " · can read images",
  "· şu an kullanılan": "· currently in use",

  // ─────────────────────────────────────────────── Dosya ekleme
  "Dosyaları bırak": "Drop files here",
  "Dosyayı çıkar": "Remove file",
  "Dosyayı önizle": "Preview file",
  "Dosya okunamadı.": "Could not read the file.",
  "Bilgisayardan yükle": "Upload from computer",
  "Cihazdan yükle": "Upload from device",
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
  "Bu istek beklediğimden uzun sürdü ve harcama eşiğine geldi.":
    "This request took longer than I expected and reached the spending threshold.",
  "Bu istek boyunca tekrar sorma": "Don't ask again during this request",
  "Lio Bakiyesi biterse yine durulur; bu seçenek yalnızca onay pencerelerini kapatır.":
    "It still stops if you run out of Lio Units; this only turns off the confirmation prompts.",
  "Tahmini bedel": "Estimated cost",
  "Devam edersem (adım başına)": "If I continue (per step)",
  "~{n} birim": { one: "~{n} unit", other: "~{n} units" },

  // ─────────────────────────────────────────────── Krediler (kullanıcı)
  "Lio Bakiyesi": "Lio Units",
  // PayTR ödeme formundan dönen kullanıcıyı karşılayan mesajlar.
  "Ödemen alındı. Bakiyen birkaç saniye içinde yüklenecek; görünmezse sayfayı yenile.":
    "Your payment went through. Your units will arrive in a few seconds — refresh the page if they don't show up.",
  "Ödeme tamamlanmadı. Kartından para çekilmedi; dilediğin zaman tekrar deneyebilirsin.":
    "The payment wasn't completed. Your card was not charged; you can try again whenever you like.",
  "Lio birimi": "Lio Units",
  // Ek bakiye (paket anahtarları backend ai-credits.config PACKAGE_SIZES'tan gelir).
  "Ek bakiye": "Extra Lio Units",
  "Ek bakiye, paketindeki aylık bakiyeden daha pahalıdır. Her ay yetmiyorsa": "Extra Lio Units cost more than the monthly units in your plan. If you run short every month,",
  "bir üst pakete geçmek": "moving up a plan",
  "daha ekonomik.": "works out cheaper.",
  "Ay sonuna yetişmeyen birkaç gün için.": "For the last few days of the month.",
  "Yoğun geçen bir ay için.": "For an unusually busy month.",
  "Sık ihtiyaç duyuyorsan üst pakete geçmek daha ucuz.": "If you need this often, moving up a plan is cheaper.",
  // Paket birimi dönem sonunda sona erer (migration 117).
  "Bunun {n} birimi paketinden; {tarih} tarihinde kalanı sona erer. Harcamada önce paket birimi kullanılır.":
    "{n} of these come with your plan; whatever is left expires on {tarih}. Plan units are used first.",
  "Paket biriminin süresi doldu": "Plan units expired",
  "Paket birimi bitti": "Plan units expired",
  "Lio Bakiyen — bakiye sayfasını aç": "Your Lio Units — open the Lio Units page",
  "Lio Bakiyen azaldı — bakiye sayfasını aç": "Your Lio Units are running low — open the Lio Units page",
  "Lio Bakiyesi: {bakiye} birim. Bakiye sayfasını aç.": "Lio Units: {bakiye}. Open the Lio Units page.",
  "Lio Bakiyeniz azaldı. Asistanı kesintisiz kullanmak için aşağıdan bakiye yükleyebilirsiniz.":
    "You're running low on Lio Units. Top up below to keep using the assistant without interruption.",
  "Bakiye yükle": "Top up Lio Units",
  "Bakiyeyi yükle": "Add the Lio Units",
  "Bakiye paketleri yüklenemedi. Sayfayı yenilemeyi dene.":
    "Could not load the Lio Units packages. Try refreshing the page.",
  "{n} birim": { one: "{n} unit", other: "{n} units" },
  Bakiye: "Balance",
  Hareketler: "Activity",
  "Henüz hareket yok.": "No activity yet.",
  "Harcanan birim": "Units spent",
  "Şimdiye kadar harcanan": "Spent so far",
  "Şimdiye kadar yapılan": "Done so far",
  "Demo hesabındasın: Lio ücretsiz, bakiyeden düşmüyor. Yukarıdaki sayı, bütün ziyaretçilerin paylaştığı saatlik deneme hakkından kalan kısım — dolarsa bir süre sonra kendiliğinden yenileniyor. Kendi hesabında böyle bir sınır yok.":
    "You're in the demo account: Lio is free here and uses no Lio Units. The number above is what's left of an hourly trial allowance shared by all visitors — if it runs out it refills on its own after a while. Your own account has no such limit.",

  // ─────────────────────────────────────────────── Siparişler
  "Bakiye siparişleri": "Lio Units orders",
  "Sipariş oluştur": "Create order",
  "Sipariş oluşturulamadı.": "Could not create the order.",
  "Sipariş iptal edilemedi.": "Could not cancel the order.",
  "Siparişler yüklenemedi.": "Could not load the orders.",
  "Bekleyen siparişlerin": "Your pending orders",
  "Ödeme bekleyen sipariş yok.": "No orders awaiting payment.",
  "Ödemeye geç": "Go to payment",
  "Ödemeyi onayla": "Confirm payment",
  "Bu sipariş iptal edilsin mi? Ödemesi sonradan gelirse bakiye otomatik yüklenmez.":
    "Cancel this order? If its payment arrives later, the units won't be added automatically.",
  "Ödemesi alınan siparişi onayla — birimler ancak onaydan sonra kullanıcının bakiyesine geçer.":
    "Confirm an order that has been paid — the Lio Units reach the user's balance only after confirmation.",
  "Ödemesi onaylanmış ama bakiyesi yüklenememiş sipariş var. Yükleme yeniden denenmeli.":
    "There is an order whose payment is confirmed but whose Lio Units could not be added. The top-up needs retrying.",
  "Çevrim içi ödeme henüz açık değil. Siparişi oluşturduğunda ödeme talimatları için seninle iletişime geçilir; ödeme onaylandıktan sonra Lio Bakiyen hesabına yüklenir.":
    "Online payment isn't available yet. Once you create the order we'll get in touch with payment instructions; your Lio Units are added after the payment is confirmed.",
  "Tamamlanan yüklemelerin aşağıdaki hareketler listesinde.": "Completed top-ups are in the activity list below.",

  // ─────────────────────────────────────────────── Yönetici: kredi
  "Lio Bakiyesi yönetimi": "Lio Units management",
  "Kullanıcılar": "Users",
  "Kullanıcı": "User",
  "Kullanıcı listesi yüklenemedi.": "Could not load the user list.",
  "Not (opsiyonel)": "Note (optional)",
  "Ör. Ağustos yüklemesi": "e.g. August top-up",
  "Ör. 0.55": "e.g. 0.55",

  // ─────────────────────────────────────────────── Yönetici: Anthropic bakiyesi
  "Anthropic bakiyesi": "Anthropic balance",
  "Anthropic maliyeti": "Anthropic cost",
  "Anthropic'e yükledim": "I topped up Anthropic",
  "Kalan birim": "Units remaining",
  "Kullanılabilir bakiye": "Available balance",
  "Kullanılan (gerçek maliyet)": "Used (actual cost)",
  "Toplam yüklenen": "Total topped up",
  "Toplam harcanan": "Total spent",
  "Yüklenen (ömür boyu)": "Topped up (all-time)",
  "Yüklenen tutar (USD)": "Amount topped up (USD)",
  "Kullanıcıya yansıyan": "Charged to users",
  "Brüt kâr": "Gross margin",
  "İstek başı maliyet": "Cost per request",
  "İstek başı birim": "Units per request",
  "Bu rakamla eşitle": "Reconcile with this figure",
  'Console\'daki gerçek "Total cost" ($)': 'Actual "Total cost" from the Console ($)',
  "Geçerli bir tutar gir.": "Enter a valid amount.",
  "Geçerli bir tutar gir (Console > Cost sayfasındaki toplam).":
    "Enter a valid amount (the total from Console > Cost).",
  "${tutar} kaydedildi. Kalan bakiye: {bakiye} birim karşılığı.":
    "${tutar} saved. Remaining balance: {bakiye} units' worth.",
  "Referans nokta ${tutar} olarak kaydedildi.": "Reference point saved as ${tutar}.",
  '"Kalan birim", Anthropic\'e yüklediğin gerçek bakiyenin ne kadarının kaldığını, aşağıdaki kullanıcı bakiyesi ile aynı birimde gösterir — kullanıcılara ne kadar birim dağıtabileceğine karar vermek için buna bak. Anthropic konsolunda bakiye yükledikçe aşağıdan buraya ekle.':
    '"Units remaining" shows how much of the real balance you topped up at Anthropic is left, in the same unit as the user Lio Units below — use it to decide how many Lio Units you can hand out. Add each Anthropic console top-up here from the field below.',
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
  "Sıra öncelik demektir: birincil sağlayıcı geçici olarak yanıt vermezse (hız sınırı, sunucu hatası, bağlantı) istek sıradakine devredilir ve Lio Bakiyesi gerçekten kullanılan modelin fiyatından düşülür. Sağlayıcı açıp kapatmak ya da sırayı değiştirmek için sunucudaki":
    "Order means priority: if the primary provider is temporarily unavailable (rate limit, server error, connection), the request falls through to the next one and Lio Units are charged at the price of the model actually used. To enable, disable or reorder providers, edit the",
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
  // ─────────────────────────────────────────────── Lio paneli (ek)
  Lio: "Lio",
  "Lio hata yapabilir.": "Lio can make mistakes.",
  "Düşünüyor…": "Thinking…",
  "Lio Bakiyem": "My Lio Units",
  "Lio Bakiyen bu isteği tamamlamaya yetmedi.": "Your Lio Units weren't enough to finish this request.",
  "Lio Bakiyeniz azaldı. Kesintisiz kullanım için bakiye yükleyin.": "You're running low on Lio Units. Top up to keep going without interruption.",
  // Mobil uygulamada yükleme çağrısı gösterilmiyor (mağaza kuralı).
  "Lio Bakiyeniz azaldı.": "You're running low on Lio Units.",
  "Sesli komut ver (ses çözümleme Lio Bakiyesi harcar)": "Give a voice command (transcription uses Lio Units)",
  "Sesli anlatım": "Narration",
  "Sesli kullanım anlatımı": "Narrated walkthrough",
  "Anlatımı sesli dinle": "Listen to the narration",
  "Anlatım hızı": "Narration speed",
  "Anlatım bitince kendiliğinden ilerle": "Advance automatically when the narration ends",
  "Diğer anlatımlar": "Other narrations",
  "Okuma sesi": "Reading voice",
  "Ses kaynağı": "Voice source",
  "Doğal ses": "Natural voice",
  "Doğal ses · ~{n} birim/100 karakter": "Natural voice · ~{n} units/100 characters",
  "Bu sesi dene (~{n} birim)": "Try this voice (~{n} units)",
  "demo ses": "sample voice",
  "Bu adımın kaydı henüz yüklenmedi; metin cihazın sesiyle okunuyor.":
    "This step's recording isn't uploaded yet; the text is read with your device's voice.",
  "Her yanıtın yanındaki hoparlöre basarak dinleyebilirsin.":
    "Tap the speaker next to any reply to listen to it.",
  // Karşılama ve öneri çipleri. Çipe tıklandığında GÖNDERİLEN metin de bu
  // çeviridir — Lio kullanıcının dilinde yanıt veriyor, isteği de o dilde
  // alması doğru.
  "Merhaba! Ben Lio. Projelerini, görevlerini ve bütçeni buradan yönetebilirsin — yazman yeterli.":
    "Hi, I'm Lio. You can manage your projects, tasks and budget from here — just type.",
  "Merhaba, ben Lio. Sesim böyle duyuluyor.": "Hi, I'm Lio. This is what my voice sounds like.",
  "Durumumu özetle": "Summarise where I stand",
  "Geciken görevlerim neler?": "Which of my tasks are overdue?",
  "Bu hafta neler teslim edilecek?": "What's due this week?",
  "Bana atanmış açık işleri listele": "List the open work assigned to me",
  "Bu dosyayı incele ve ne olduğunu özetle.": "Look at this file and summarise what it is.",

  // Ek türleri
  PDF: "PDF",
  Word: "Word",
  Tablo: "Spreadsheet",
  Metin: "Text",
  Ses: "Audio",
  "Önizleme yüklenemedi.": "Could not load the preview.",
  "Lio (⌘K) · yukarı-aşağı sürükleyerek taşıyabilirsin": "Lio (⌘K) · drag up or down to move",
};
