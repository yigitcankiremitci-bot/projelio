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

Şirket kurucusu: Organizasyonu düzenle > **Web sitesi** > ad + (isteğe bağlı)
site adresi + webhook adresi > **Bağlantı oluştur**. Çıkan **API anahtarı**
(`psite_…`) bir kez gösterilir; **imza sırrı** (`whsec_…`) sonradan "İmza
sırrını göster" ile yeniden okunabilir. İkisini sitenin geliştiricisine iletir.

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
X-Projelio-Event: product.updated | product.deleted | ping
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
