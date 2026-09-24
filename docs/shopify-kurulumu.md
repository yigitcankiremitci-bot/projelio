# Shopify entegrasyonu — kurulum

Faz 1: Shopify → Projelio, tek yön. Siparişler Müşteriler > Tahsilat'a,
ödenen tutarlar kasaya (`source='tahsilat'`) düşer. Kod:
`backend/src/modules/shopify/`, arayüz `apps/web/src/components/ShopifySection.tsx`
(Organizasyonu düzenle penceresinde, yalnızca kurucu görür), şema
`database/migrations/129_shopify.sql`.

## 1. Shopify tarafı (bir kez)

Uygulamalar artık Partner Dashboard'da değil **Dev Dashboard**'da yönetiliyor
(dev.shopify.com). Partners hesabı yine gerekli: Dev Dashboard'a oradan girilir.

1. **Uygulama oluştur:** Dev Dashboard > Apps > *Create app* > *Start from Dev Dashboard*
   > ad: `Projelio`.
2. **Sürüm (Versions) oluştur** — uygulamanın yapılandırması sürümle yayımlanır:
   - **App URL:** `https://app.projelio.app`
   - **Embed app in Shopify admin:** KAPALI (Projelio kendi sitesinde çalışıyor)
   - **Webhooks API version:** `2026-07` (koddaki `SHOPIFY_API_VERSION` ile aynı)
   - **Scopes:** `read_orders,read_products` (koddaki `SHOPIFY_SCOPES` ile aynı)
   - **Redirect URLs:** `https://api.projelio.app/shopify/callback` — BİREBİR
   - **Compliance webhooks** (üçü de): `https://api.projelio.app/shopify/webhook`
     — `customers/data_request`, `customers/redact`, `shop/redact`
   - Sipariş webhook'larını (orders/create, orders/updated, orders/paid,
     app/uninstalled) BURAYA GİRME: mağaza bağlanınca kod API ile açıyor.
     İkisi birden olursa her olay iki kez gelir.
   - *Release*.
3. **Settings:** Client ID → `SHOPIFY_API_KEY`, Client secret → `SHOPIFY_API_SECRET`.
4. **Geliştirme mağazası (dev store) aç** ve orada dene. Dağıtım seçilmeden de
   kendi organizasyonundaki dev store'a kurulabiliyor; gerçek müşteriye açmadan
   önce bütün akış burada denenir.
5. **Korumalı müşteri verisi (Protected customer data) başvurusu** — API access
   bölümünden. Onay yoksa siparişte müşterinin adı/e-postası/telefonu BOŞ gelir ve
   bütün siparişler mağazanın "Shopify misafir" kartına düşer. Ad, e-posta,
   telefon ve adres alanlarını iste; gerekçe: "siparişi müşterinin CRM kartına
   bağlamak ve tahsilatı izlemek". Gizlilik politikası bağlantısı isteniyor.
6. **Dağıtım (Distribution) — GERİ ALINAMAZ, en son seç:**
   - *Public*: Shopify App Store'da listelenir, App Review'dan geçer. Birden çok
     müşteriye sunmanın tek yolu bu.
   - *Custom*: tek mağaza ya da tek Plus organizasyonu. Müşterilere sunmak için UYGUN DEĞİL.

### Jetonlar (bkz. migration 132)

Yeni public uygulamalar **süresi dolan** çevrimdışı jeton kullanmak zorunda:
erişim jetonu 1 saat, yenileme jetonu 90 gün ve her yenilemede değişiyor. Kod
bunu `expiring=1` ile istiyor, gerektiğinde yeniliyor ve her gece 04:50'de
süresi yaklaşanları tazeliyor. Siparişler webhook'la geldiği için jetona bağlı
değil; jeton düşerse yalnızca bağlantıyı kaldırma ve (Faz 2) geçmiş aktarımı etkilenir.

### App Review'dan önce kapanması gerekenler

- **Shopify'dan başlayan kurulum:** Mağaza sahibi uygulamayı App Store'dan
  kurduğunda Shopify, App URL'ye `?shop=&hmac=` ile gelir ve uygulamanın hemen
  yetkilendirmeyi başlatmasını bekler. Bugün kurulum yalnızca Projelio'daki
  "Mağaza bağla" düğmesinden başlıyor; App URL'de bu karşılama sayfası YOK.
- **Ücretlendirme:** App Store'daki uygulamalar mağazadan aldıkları ücreti
  Shopify Billing API ile almak zorunda. Entegrasyon Projelio aboneliğinin
  parçası olarak sunulacaksa bu kuralın nasıl uygulandığı başvurudan önce
  netleştirilmeli.

## 2. Sunucu (backend/.env)

```
SHOPIFY_API_KEY=        # Client ID
SHOPIFY_API_SECRET=     # Client secret — webhook imzası da bununla doğrulanır
SHOPIFY_TOKEN_ENC_KEY=  # openssl rand -base64 32
API_PUBLIC_URL=https://api.projelio.app   # geri dönüş ve webhook adresi bundan kuruluyor
```

Üçü tanımlanmadan kart arayüzde hiç görünmez.

## 3. Migration

`129_shopify.sql` ve `132_shopify_jeton_yenileme.sql`.

## Davranış özeti

| Olay | Sonuç |
|---|---|
| Yeni sipariş | Müşteri kartı bulunur (Shopify kimliği → e-posta) ya da açılır; `musteri_siparisleri` satırı (`kaynak='shopify'`) |
| Sipariş güncellendi | Aynı satır güncellenir (`dis_kimlik` tekil) |
| Ödeme alındı / kısmi ödeme | Shopify'ın "ödendi" dediği ile bizdeki tahsilatların farkı yeni tahsilat → kasa satırı |
| Test siparişi, sıfır tutar | Atlanır (`shopify_olaylari.durum='atlandi'`, sebebi `hata` sütununda) |
| İptal edilmiş, bizde kaydı yok | Atlanır |
| Uygulama kaldırıldı | Bağlantı pasif, jeton silinir; gelmiş kayıtlar kalır |
| customers/redact | Shopify'dan açılmış kartın kişisel bilgisi silinir; sipariş/tahsilat kalır (yasal saklama) |
| shop/redact | Bağlantı satırları ve olay kuyruğu silinir |

## Faz 1'de OLMAYANLAR (bilerek)

- **İadeler ve sonradan iptal:** tahsil edilen hiçbir zaman azalmaz. Faz 2'de iade
  kasaya ayrı gider satırı olarak yazılacak.
- **Geçmiş siparişlerin ilk aktarımı:** yalnızca bağlandıktan sonraki olaylar gelir.
- **Ürün eşitleme**, siparişten görev açma, Lio araçları.
- **Serbest çalışanın işi (job) kapsamı:** yalnızca şirket.
- **Paket sınırı:** her pakette açık — karar verilmedi.
- Shopify'dan gelen siparişin Projelio'da elle düzenlenmesi engellenmiyor ama bir
  sonraki `orders/updated` üzerine yazar.
