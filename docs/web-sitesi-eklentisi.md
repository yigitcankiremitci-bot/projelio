# Web sitesi eklentisi

Şirketin **kendi (özel kodlu) web sitesi** Projelio'daki ürünleri listeler,
sitede satış olunca stok Projelio'da da düşer. Çift yön:

| Yön | Nasıl |
|---|---|
| Projelio → site | Site ürünleri anahtarla **okur** (`GET /v1/site/products`); ürün değişince Projelio sitenin **webhook** adresine imzalı bildirim gönderir |
| Site → Projelio | Site satışı/iadeyi **bildirir** (`POST /v1/site/stock-movements`); stok tek işlemde ve bir kez düşer |

Kod: `backend/src/modules/web-sitesi/` (saf kurallar `web-sitesi-esleme.ts`),
arayüz `apps/web/src/components/WebSitesiSection.tsx` (Organizasyonu düzenle >
Web sitesi), tablo/tetikleyici/fonksiyon `database/migrations/186_web_sitesi_eklentisi.sql`.

**B2B sipariş portalı** (migration 187 + 188, 2026-11-09): aynı bağlantının
üstünde müşteriye özel fiyat, portal hesapları ve sipariş. Kod
`web-sitesi-b2b.service.ts`; müşteri kartında Siparişler sekmesinin üstündeki
"Web portalı" bölümü `apps/web/src/components/musteri/MusteriPortali.tsx`.
Ayrıntı aşağıda "B2B sipariş portalı" başlığında.

## Sunucu kurulumu (bir kez)

1. Migration 186'yı uygula (`./deploy/migrate.sh uygula`).
2. `backend/.env`:
   ```
   WEB_SITESI_SIR_ENC_KEY=<openssl rand -base64 32>
   WEB_SITESI_EPOSTALARI=ilk-kullanici@ornek.com
   ```
   - Şifreleme anahtarı yoksa bağlantı açılamaz (kart uyarı gösterir).
   - İzin listesi boşsa kart **herkese** kapalı. Liste yalnızca kartı görmeyi ve
     bağlantı açmayı kısıtlar; açılmış bir sitenin anahtarı listeden bağımsız
     çalışır. Herkese açmak = liste kontrolünü kaldırmak (`WebSitesiService.izinli`).
3. `API_PUBLIC_URL` tanımlı olmalı — kartta gösterilen API adresi bundan çıkar.

## Kullanıcı tarafı

Kartı **izin listesindeki ve şirkette çalışan** kişi yönetir: kurucu, şirket
üyesi, departman çalışanı ya da yöneticisi (taşeron hiçbir zaman). Yani siteyi
kodlayan geliştirici şirkete departman çalışanı olarak eklenir, e-postası
`WEB_SITESI_EPOSTALARI`'na yazılır ve kurucunun hesabına girmeden bağlantıyı
kendisi açar. ⚠ Listedeki kişi çalıştığı HER şirkette bağlantı açabilir —
anahtar o şirketin ürünlerini okur ve stoğunu düşürür; listeyi dar tutun.

Organizasyonu düzenle > **Web sitesi** > ad + (isteğe bağlı)
site adresi + webhook adresi > **Bağlantı oluştur**. Çıkan **API anahtarı**
(`psite_…`) bir kez gösterilir; **imza sırrı** (`whsec_…`) sonradan "İmza
sırrını göster" ile yeniden okunabilir. Bağlantıyı geliştirici açmadıysa ikisi ona iletilir.

Hangi ürünler sitede: **arşivde olmayan ve durumu "Satışta"** olan her ürün.
Ürün satış dışına alınır ya da arşivlenirse site `product.deleted` alır.

---

## Geliştirici rehberi (sitenin kodunu yazan kişi için)

Temel adres: `https://api.projelio.app/v1/site`
Kimlik: her istekte `Authorization: Bearer psite_...`

> **Anahtarı yalnızca sunucu tarafında kullanın.** Tarayıcıya giden JavaScript'e
> koyarsanız herkes ürünlerinizi okuyabilir ve stok düşürebilir.
> Dakikada en çok 300 istek.

### Anahtarı denemek

```bash
curl https://api.projelio.app/v1/site/ping -H "Authorization: Bearer psite_..."
# {"ok":true,"connection_id":"..."}
```

### Ürünleri okumak

```
GET /products?page=1&per_page=50          (per_page en çok 200)
GET /products?sku=KUPA-01
GET /products?category=Kupalar
GET /products/{sku veya ürün id}
```

```json
{
  "data": [{
    "id": "0b6f5f7e-…",
    "sku": "KUPA-01",
    "barcode": null,
    "name": "El yapımı kupa",
    "description": "…",
    "brand": null,
    "category": "Kupalar",
    "kind": "product",
    "unit": "piece",
    "price": 149.9,
    "currency": "TRY",
    "tax_rate": 20,
    "stock": 12,
    "in_stock": true,
    "cover_image": "https://…",
    "images": ["https://…"],
    "features": ["El yapımı"],
    "specs": [{ "label": "Hacim", "value": "350 ml" }],
    "warranty": null,
    "lead_time": null
  }],
  "page": 1,
  "per_page": 50,
  "has_more": false
}
```

- `stock: null` = stok takip edilmiyor (tükendi DEĞİL); `in_stock` bunu hesaba katar.
- `price` KDV'nin dahil olup olmadığını Projelio'da girildiği gibi verir; `tax_rate` yüzde.
- Maliyet, tedarikçi ve iç notlar API'den hiç çıkmaz.

### Satış ve iade bildirmek

Sipariş **ödendiğinde** (ya da stoğu ayırdığınız anda) bir kez çağırın:

```bash
curl -X POST https://api.projelio.app/v1/site/stock-movements \
  -H "Authorization: Bearer psite_..." -H "Content-Type: application/json" \
  -d '{
    "reference": "SIP-1042",
    "type": "sale",
    "items": [
      { "sku": "KUPA-01", "quantity": 2 },
      { "product_id": "0b6f5f7e-…", "quantity": 1 }
    ]
  }'
```

```json
{
  "reference": "SIP-1042",
  "type": "sale",
  "items": [
    { "product_id": "…", "sku": "KUPA-01", "quantity": 2, "stock": 10, "applied": true }
  ]
}
```

- `type`: `"sale"` stoğu düşürür, `"return"` geri ekler (iptal/iade). Varsayılan `sale`.
- **Güvenle yeniden deneyin:** aynı `reference` + `type` ikinci kez gelirse stok
  yeniden düşmez, `applied: false` döner. Ağ hatasında aynı isteği tekrar gönderin.
- Ya hepsi ya hiçbiri: bulunamayan bir SKU varsa hiçbir kalem işlenmez,
  `422 {"message":"Some products were not found.","not_found":["…"]}` döner.
- Stok eksiye düşebilir (ön sipariş, sayım açığı) — satış reddedilmez.
- Kısmi iade: aynı siparişin ikinci iadesi için farklı bir `reference` verin
  (ör. `SIP-1042-iade-2`).

### Webhook (Projelio → site)

Ürün eklenince, değişince (fiyat, stok, görsel, açıklama…) ya da satıştan
kalkınca webhook adresinize `POST` gelir. Ürün art arda değişirse **tek**
bildirim gelir ve her zaman ürünün **son hâlini** taşır — fark değil tam kayıt.

```
X-Projelio-Event: product.updated | product.deleted | portal_user.upserted | portal_user.disabled | order.updated | ping
X-Projelio-Timestamp: 1731150000
X-Projelio-Signature: sha256=<hex>
```

```json
{ "event": "product.updated", "sent_at": "2026-11-09T12:00:00.000Z", "data": { "product": { …ürün… } } }
{ "event": "product.deleted", "sent_at": "…", "data": { "product": { "id": "…", "sku": "KUPA-01" } } }
```

**İmzayı doğrulayın** (ham gövde üzerinden, JSON'u ayrıştırmadan önce):

```js
import crypto from "node:crypto";

function projelioImzasiGecerli(hamGovde, basliklar, sir) {
  const zaman = basliklar["x-projelio-timestamp"];
  const imza = basliklar["x-projelio-signature"] ?? "";
  // 5 dakikadan eski bildirimi reddet (yeniden oynatma koruması)
  if (Math.abs(Date.now() / 1000 - Number(zaman)) > 300) return false;
  const beklenen = "sha256=" + crypto.createHmac("sha256", sir).update(`${zaman}.${hamGovde}`).digest("hex");
  return imza.length === beklenen.length && crypto.timingSafeEqual(Buffer.from(imza), Buffer.from(beklenen));
}
```

- 10 saniye içinde **2xx** dönün; işi arkada yapın. Yönlendirme (3xx) izlenmez.
- 2xx dışı yanıtta yeniden denenir: 1 dk, 5 dk, 15 dk, 1 sa, 3 sa, 6 sa, sonra
  12 saatte bir; 10 denemeden sonra bırakılır (Projelio kartında "Son hata"
  görünür, "Tüm ürünleri yeniden gönder" ile tamamı tekrar gönderilir).
- Webhook adresi `https://` ve herkese açık olmalı (iç ağ / localhost reddedilir).
- Webhook zorunlu değil: hiç tanımlanmazsa site `GET /products`'ı periyodik
  okuyarak da eşitleyebilir.

### Önerilen kurulum sırası

1. `GET /ping` ile anahtarı doğrula.
2. `GET /products` ile bütün sayfaları dolaşıp sitenin veritabanını doldur
   (ürünü `id` ile eşle; SKU değişebilir, `id` değişmez).
3. Webhook ucunu yaz, Projelio kartında "Bağlantıyı dene" ile `ping` al.
4. Ödeme onayına `POST /stock-movements` ekle; iptal/iadeye `type: "return"`.
   (B2B portal siparişinde değil — aşağıya bakın.)

## B2B sipariş portalı

Müşteri (ör. eczane) portala girer, kendi fiyatını görür, sipariş verir;
sipariş Projelio'da **Alındı** aşamasında açılır, şirket onaylayınca stok düşer.

### Kurallar (kullanıcı kararları, 2026-11-09)

- **Portal hesabını Projelio açar, kullanıcı veritabanı portalda.** Projelio
  şifre TUTMAZ, şifre Projelio'dan GEÇMEZ. Müşteri kartında "Portal kullanıcısı
  oluştur" → portala imzalı `portal_user.upserted` gider, portal kendi
  kullanıcısını açar ve şifre belirleme e-postasını kendisi gönderir.
  Kapatınca `portal_user.disabled`. Bir müşterinin birden çok portal
  kullanıcısı olabilir; bir e-posta aynı portalda aynı anda tek açık hesaba bağlı.
- **Yetkiler**: `siparis_ver`, `fiyat_gor`, `siparis_gecmisi`. Projelio
  `siparis_ver`'i siparişte doğrular (`portal_user_id` gönderilirse); fiyatı ve
  geçmişi göstermemek **portalın** sorumluluğu (bu uçlar sitenin sunucusundan
  çağrılır, kullanıcıyı tanımaz).
- **Fiyat**: liste fiyatı herkese aynı, KDV **hariç** girilir; müşterinin
  iskontosu (`%`, müşteri kartında) önce KDV hariç fiyata uygulanır, sonra KDV
  eklenir, her adım kuruşa yuvarlanır (`packages/shared/src/iskontoluFiyat.ts`,
  testleri kuruş kuruş). Portal fiyatı **kendisi hesaplamasın**: sunucudan
  hesaplanmış alır, yoksa yuvarlama farkıyla sipariş tutarından ayrışır.
- **Stok sipariş gelince DÜŞMEZ.** Projelio'da onaylanınca (Alındı → Onaylandı /
  Hazırlanıyor / Yolda / Teslim edildi'ye ilk geçiş) **bir kez** düşer; onaydan
  sonra iptal edilirse geri eklenir. Onaydan sonra Alındı'ya dönülmez; iptal
  geri alınmaz. Onaylı siparişin ürün/adetleri kilitli. Tahsilatı olan sipariş
  iptal edilmez; iptal edilen sipariş alacakta sayılmaz.
- Aynı kural elle açılan siparişlerde de geçerli (yeni siparişin varsayılan
  aşaması Onaylandı). Shopify ve Excel siparişlerinde aşama var, stok değişmez.
- **Portal siparişi için `/stock-movements` KULLANMAYIN** — stok onayda düşer;
  ikisini birden çağırmak stoğu iki kez düşürür. `/stock-movements` sitenin
  kendi perakende satışı içindir.
- Ürünler Excel'den gelirse: Ürünler > Excel ile yükle > "Stok kodu aynı olan
  mevcut ürünleri güncelle" (stok ayrıca işaretlenmedikçe yazılmaz).

### Müşteriye özel fiyatla ürünler

```bash
curl "https://api.projelio.app/v1/site/products?customer_id=<müşteri id>" -H "Authorization: Bearer psite_..."
```

Her ürüne şunlar eklenir (fiyatı olmayan üründe `null`):

```json
{ "price": 100, "tax_rate": 10, "discount_rate": 12.5,
  "list_price_with_tax": 110, "customer_price": 87.5, "customer_price_with_tax": 96.25 }
```

`GET /products/:ref?customer_id=…` de aynı. Ürünlerde `min_stock` (kritik stok) da var.

### Müşteri

```
GET /v1/site/customers/:id
→ { "id", "display_name", "legal_name", "city", "district", "status": "active|passive|blocked", "discount_rate" }
```

Bilerek dar: vergi no, telefon, e-posta, adres ayrıntısı ve tahsilat **çıkmaz**.
Yalnızca bağlantının şirketinin, Müşteriler defterindeki, arşivde olmayan
kaydı; başkası `404 Customer not found.`

### Sipariş vermek

```bash
curl -X POST https://api.projelio.app/v1/site/orders \
  -H "Authorization: Bearer psite_..." -H "Content-Type: application/json" \
  -d '{
    "customer_id": "…",
    "reference": "PORTAL-10045",
    "portal_user_id": "…",
    "note": "Salı teslim",
    "items": [ { "sku": "SPR-30", "quantity": 2 }, { "product_id": "…", "quantity": 1 } ]
  }'
```

- Yanıt `201 { "created": true, "order": {…} }`. Aynı `reference` tekrar
  gelirse sipariş yeniden açılmaz: `200 { "created": false, "order": {…mevcut…} }`
  — ağ kopunca güvenle yeniden deneyin.
- İstekteki fiyat **yok sayılır**; birim fiyat sunucuda ürün + müşteri
  iskontosu + KDV'den hesaplanır. Siparişte fiyatlar **KDV dahil**
  (`unit_price`, `list_unit_price`, `total`).
- Reddedilir (hiçbir şey yazılmaz): müşteri pasif/engelli, ürün yok / satışta
  değil / fiyatsız, adet ≤ 0, farklı para birimleri, `portal_user_id` bu
  müşterinin açık ve `siparis_ver` yetkili kullanıcısı değil. Tek kalem
  geçersizse sipariş hiç açılmaz.
- Sipariş Projelio'da bağlantıya özel "Web sitesi: <bağlantı adı>" satış
  kanalında açılır (ilk siparişte kendiliğinden); vade ve ödeme yöntemi o
  kanalın varsayılanından gelir.

Sipariş yükü:

```json
{ "id": "…", "reference": "PORTAL-10045", "customer_id": "…",
  "status": "received|approved|preparing|shipped|delivered|cancelled",
  "status_changed_at": "…", "source": "website|other", "portal_user_id": "…",
  "order_date": "2026-11-09", "currency": "TRY", "total": 288.75, "note": "…",
  "items": [ { "product_id": "…", "sku": "SPR-30", "name": "…", "quantity": 2, "unit": "adet",
               "list_unit_price": 110, "unit_price": 96.25, "total": 192.5 } ],
  "created_at": "…" }
```

### Sipariş geçmişi ve portal kullanıcıları

```
GET /v1/site/customers/:id/orders          → { "data": [ sipariş… ] }  (en çok 100, yeniden eskiye; tahsilat YOK)
GET /v1/site/portal-users[?customer_id=]   → { "data": [ { "id", "customer_id", "email", "name", "permissions", "active" } ] }
```

`portal-users` webhook kaçırıldıysa portalın kullanıcı listesini eşitlemesi için.

### B2B webhook olayları

```json
{ "event": "portal_user.upserted", "data": { "portal_user": { "id", "customer_id", "email", "name", "permissions": ["siparis_ver", "fiyat_gor", "siparis_gecmisi"], "active": true } } }
{ "event": "portal_user.disabled", "data": { "portal_user": { …, "active": false } } }
{ "event": "order.updated",        "data": { "order": { …sipariş… } } }
```

- `portal_user.upserted` açılışta ve her değişiklikte (ad, yetki, yeniden açma)
  gelir: kullanıcıyı `id` ile ekleyin ya da güncelleyin; ilk gelişte şifre
  belirleme e-postasını gönderin.
- `order.updated` yalnızca portaldan gelmiş siparişlerde, aşama / tutar / not
  değişince gelir. Kuyruk kayıt başına tek satır: art arda değişiklikte son hâl gelir.
