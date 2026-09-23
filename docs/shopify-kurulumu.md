# Shopify entegrasyonu — kurulum

Faz 1: Shopify → Projelio, tek yön. Siparişler Müşteriler > Tahsilat'a,
ödenen tutarlar kasaya (`source='tahsilat'`) düşer. Kod:
`backend/src/modules/shopify/`, arayüz `apps/web/src/components/ShopifySection.tsx`
(Organizasyonu düzenle penceresinde, yalnızca kurucu görür), şema
`database/migrations/129_shopify.sql`.

## 1. Shopify tarafı (bir kez)

1. **Shopify Partners hesabı** aç → Dev Dashboard'da yeni uygulama.
2. **Dağıtım:** **public app**, App Store'da listelenmeden. *Custom distribution*
   tek mağazaya (ya da tek Plus organizasyonuna) kurulur; müşterilerimize sunacağımız
   için public gerekli.
3. **App URL:** `https://app.projelio.app` (mağaza sahibi Shopify'dan uygulamayı açarsa buraya gelir).
4. **Redirect URL:** `https://api.projelio.app/shopify/callback` — BİREBİR.
5. **İzinler (scopes):** `read_orders`, `read_products` (koddaki `SHOPIFY_SCOPES` ile aynı olmalı).
6. **Zorunlu gizlilik webhook'ları** — üçü de `https://api.projelio.app/shopify/webhook`:
   `customers/data_request`, `customers/redact`, `shop/redact`.
   Sipariş webhook'larını (orders/create, orders/updated, orders/paid, app/uninstalled)
   elle kurmaya gerek yok: mağaza bağlanınca kod API ile açıyor.
7. **Korumalı müşteri verisi (Protected customer data) başvurusu** — API access
   bölümünden. Onay yoksa siparişte müşterinin adı/e-postası/telefonu BOŞ gelir ve
   bütün siparişler mağazanın "Shopify misafir" kartına düşer. Başvuruda KVKK /
   gizlilik politikası bağlantısı ve verinin ne için kullanıldığı soruluyor
   ("siparişi müşterinin CRM kartına bağlamak, tahsilatı izlemek"). Ad, e-posta,
   telefon ve adres alanlarını iste.
8. App Store listelemesi Faz 1'de YOK; listelenmemiş uygulama yükleme bağlantısıyla
   ya da Projelio'daki "Mağaza bağla" düğmesiyle kurulur.

## 2. Sunucu (backend/.env)

```
SHOPIFY_API_KEY=        # Client ID
SHOPIFY_API_SECRET=     # Client secret — webhook imzası da bununla doğrulanır
SHOPIFY_TOKEN_ENC_KEY=  # openssl rand -base64 32
API_PUBLIC_URL=https://api.projelio.app   # geri dönüş ve webhook adresi bundan kuruluyor
```

Üçü tanımlanmadan kart arayüzde hiç görünmez.

## 3. Migration

```bash
./deploy/migrate.sh uygula   # 129_shopify.sql
```

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
