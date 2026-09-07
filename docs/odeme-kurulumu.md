# Ödeme ve abonelik kurulumu

Kod tarafı hazır; bu belge **sunucuda ve iyzico panelinde elle yapılacak** işleri
anlatır. Hiçbir anahtar tanımlı değilken sistem sessizce kapalıdır: paket ekranı
"ödeme sistemi henüz açılmadı" der, satın alma uçları 503 döner. Bu bilinçli —
"yapılandırılmamışsa başarılı say" kısayolu bedava abonelik dağıtmak demek.

## Kim ne yapıyor

```
Kullanıcı → panel → POST /billing/checkout → iyzico ödeme formu (kart BİZE UĞRAMAZ)
                                                     ↓
                    tarayıcı → POST /billing/iyzico/callback → iyzico'ya sorulur → abonelik + kredi
                                                     ↓
              her yenilemede: iyzico → POST /billing/iyzico/webhook (imzalı) → dönem ilerler + kredi
```

Kartın saklanması, yenileme çekimi ve başarısız denemeler **iyzico tarafında**
yürür. Bizde duran tek şey "kim, hangi plana, hangi döneme kadar hak kazandı".

## 1. Migration

`092_abonelikler.sql` **henüz uygulanmadı**. Uygulanmadan abonelik ekranı
çalışmaz (ayarlar tablosu okunamaz, sistem yapılandırılmamış görünür).

```bash
./deploy/migrate.sh durum
./deploy/migrate.sh uygula
```

## 2. iyzico hesabı ve abonelik ürünü

1. iyzico'da üye iş yeri başvurusunu tamamla. Başvuru kimlik/vergi bilgisi
   ister; **hangi tüzel yapının kabul edildiğini iyzico ile teyit et** — bu
   ticari/hukuki bir konu, koddan çıkarılamaz.
2. Panelde **Abonelik** ürününü etkinleştir (ilk üç ay ücretsiz, sonrası yıllık
   ücretli).
3. **Webhook imzası** özelliğini açtır: `entegrasyon@iyzico.com` adresine yaz.
   Açılmadan `X-IYZ-SIGNATURE-V3` başlığı gelmez ve webhook ucumuz **her isteği
   reddeder** (imzasız gövdeye güvenmiyoruz — güvenseydik herkes istediği
   aboneliği "ödendi" ilan edebilirdi).

## 3. Ürün ve ödeme planları

iyzico panelinde **bir ürün** (ör. "Projelio") ve altında **altı ödeme planı** aç:

| Plan | Dönem | Vitrin (USD) | iyzico planındaki tutar |
|---|---|---|---|
| Starter | Aylık | $4,99 | kur × 4,99 |
| Starter | Yıllık | $49,90 | kur × 49,90 |
| Pro | Aylık | $9,99 | kur × 9,99 |
| Pro | Yıllık | $99,90 | kur × 99,90 |
| Business | Aylık | $24,99 | kur × 24,99 |
| Business | Yıllık | $249,90 | kur × 249,90 |

**Kur canlı değil, bilerek.** Abonelikte tutar bir kez sabitlenir ve her
yenilemede oynamaz; iyzico'nun ödeme planı da tutarı sabitler. Fiyatı
değiştirmek = iyzico'da **yeni bir plan açmak**. Eski aboneler eski planla ve
eski tutarla devam eder — olması gereken davranış budur.

Her plan için üretilen **referans kodunu** kopyala.

## 4. Panele gir (SSH gerekmez)

**Admin paneli > Paketler ve ödeme**: her plan/dönem satırına referans kodunu ve
iyzico planındaki **TRY tutarını** yaz.

> Buradaki tutar iyzico'daki planla **birebir aynı olmalı**. Ayrışırsa kullanıcıya
> bir tutar gösterip başka bir tutar çekmiş oluruz. Tutar boş bırakılırsa o plan
> satın alınamaz hâle gelir (yanlış tutar göstermektense düğmeyi kapatmak doğru).

İsteğe bağlı: **USD/TRY kuru** alanı yalnızca vitrinde "$4,99 ≈ … ₺" göstermek
için; tahsilatta kullanılmaz.

## 5. Ortam değişkenleri

`backend/.env` (örnekler `backend/.env.example` içinde):

```
IYZICO_API_KEY=...
IYZICO_SECRET_KEY=...
IYZICO_MERCHANT_ID=...          # webhook imzasında kullanılıyor
IYZICO_BASE_URL=https://sandbox-api.iyzipay.com   # üretim: https://api.iyzipay.com
```

`IYZICO_BASE_URL` **tanımsızsa kum havuzu** kullanılır. Varsayılanı üretim
yapmak, yarım kalmış bir kurulumda gerçek kartlardan para çekmek demekti; ters
yön (kum havuzunda kalıp para alamamak) fark edilir ve düzeltilir.

`BACKEND_URL` ve `WEB_APP_URL` doğru olmalı: ödeme formunun dönüş adresi
ilkinden, kullanıcının geri yollandığı adres ikincisinden türetiliyor.

## 6. iyzico panelinde bildirim adresleri

**Ayarlar > Üye İşyeri Ayarları > Üye İşyeri Bildirimleri**:

| Ne | Adres |
|---|---|
| Abonelik bildirimleri | `https://api.projelio.app/billing/iyzico/webhook` |

Ödeme formunun dönüş adresi panelde tanımlanmaz; her istekte biz gönderiyoruz
(`{BACKEND_URL}/billing/iyzico/callback`).

iyzico 2xx alana kadar **15 dakikada bir, 3 kez** yeniden gönderir. Yinelenen
teslimat `subscription_events.dedupe_key` tekil indeksiyle veritabanı düzeyinde
kesiliyor; aynı olay iki kez kredi yükleyemez.

## 7. Test akışı

1. `IYZICO_BASE_URL` kum havuzunda, anahtarlar sandbox anahtarları.
2. Panelde bir paket seç → iyzico formu açılır → iyzico'nun test kartını gir.
3. Dönüşte paket ekranında "Paketin etkinleşti" görünmeli, **AI kredilerim**
   sayfasında bakiye planın aylık kredisi kadar artmış olmalı.
4. `subscription_events` tablosuna bak: webhook geldiyse `signature_ok = true`
   ve `processed_at` dolu olmalı. `error` doluysa sebebi orada yazar.
5. Arayüzde "Ödeme sistemi test modunda" uyarısı görünüyorsa taban adres kum
   havuzudur — canlıya geçerken `IYZICO_BASE_URL`'i değiştirmeyi unutma.

## 8. Yıllık abonelerde kredi

Yıllık abone **parayı yılda bir öder ama krediyi her ay alır**. Bu yüzden kredi
yüklemesi yenileme ödemesine bağlanamaz: gecelik iş (`03:20`,
`billing-renewal.processor.ts`) o ayın kredisini yükler. Elle tetiklemek için
**Admin paneli > run-renewals** ucu var (`POST /billing/admin/run-renewals`).

Kredi ayı, abonelik tarihine sabitlenir: ayın 7'sinde abone olan her ayın 7'sinde
kredi alır. Aynı döneme ikinci kez kredi yüklenmesi
`subscription_credit_grants(subscription_id, period_start)` tekil indeksiyle
veritabanı düzeyinde imkânsız.

## 9. Mağazalar (App Store / Google Play)

Kod hazır, **anahtar tanımlanana kadar kapalı**. Dijital abonelik satan bir mobil
uygulamada mağazalar kendi ödeme sistemlerini zorunlu tutar; bu yüzden mobil
istemci çıkarken şu adımlar gerekir:

1. Mağaza panellerinde abonelik ürünlerini aç (ör. `app.projelio.pro.monthly`).
2. Ürün kimliklerini **Admin paneli > Paketler ve ödeme > app_store / play_store**
   sekmesine yaz.
3. Ortam değişkenlerini tanımla (`APPSTORE_*`, `PLAY_*` — bkz. `.env.example`).
4. Bildirim adresleri:
   - App Store Server Notifications V2 → `https://api.projelio.app/billing/apple/notifications`
   - Google Play RTDN (Pub/Sub push) → `https://api.projelio.app/billing/google/notifications`

**Doğrulama bildirime değil, mağazaya sorarak yapılır.** İstemciden gelen
`originalTransactionId` / `purchaseToken` bir *kimliktir*, kanıt değil; durum her
zaman Apple'ın ya da Google'ın API'sinden okunur. Aynı sebeple bildirimin imzası
doğrulanmaz — karar zaten bildirime dayanmıyor.

Mağaza aboneliğini **biz iptal edemeyiz**; kullanıcı mağazanın kendi ekranından
iptal eder. Panel bunu söyleyip doğru yere yönlendirir.

## 10. Kontrol listesi

- [ ] Migration 092 uygulandı
- [ ] iyzico üye iş yeri başvurusu onaylandı
- [ ] Abonelik ürünü etkin
- [ ] Webhook imzası (`X-IYZ-SIGNATURE-V3`) açtırıldı
- [ ] 6 ödeme planı açıldı, referans kodları panele girildi
- [ ] Tutarlar iyzico planlarıyla birebir aynı
- [ ] `IYZICO_*` değişkenleri tanımlı, `IYZICO_BASE_URL` doğru ortamı gösteriyor
- [ ] Webhook adresi iyzico panelinde tanımlı
- [ ] Kum havuzunda uçtan uca bir satın alma denendi, kredi yüklendi
- [ ] `landing` yeniden yayımlandı (fiyatlar `GET /billing/public/plans`'tan geliyor)
- [ ] Mesafeli satış ve iptal/iade metinleri güncel (`landing/src/i18n/legal.ts`)
