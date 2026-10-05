# Instagram Entegrasyonu — kurulum ve işleyiş

> Sosyal Medya modülünün (`pd_sosyal_medya`) doğrudan yayın yeteneği.
>
> Migration: `058_social_publishing.sql` · Kod: `backend/src/modules/social-media/`
> Modül sözleşmesi: [13-modul-sosyal-medya.md](13-modul-sosyal-medya.md)

---

## 1. Hangi yol seçildi ve neden

Meta iki ayrı yol sunuyor:

| | Instagram API **with Facebook Login** | Instagram API **with Instagram Login** ✅ |
|---|---|---|
| Host | `graph.facebook.com` | `graph.instagram.com` |
| Şart | Instagram hesabı bir **Facebook Sayfasına** bağlı olmalı | Yalnızca **profesyonel Instagram hesabı** |
| İzinler | `instagram_basic`, `instagram_content_publish`, `pages_read_engagement` (+ Business Manager'da rol varsa `ads_management`, `ads_read`) | `instagram_business_basic`, `instagram_business_content_publish` |
| Büyük video | Resumable upload var | Yok (public URL ile gider) |

**Instagram Login seçildi.** Facebook Sayfası zorunluluğu, hedef kullanıcımız olan küçük işletme ve serbest çalışanda pratikte kurulamıyordu: "Sayfa" kavramını hiç kullanmayan bir hesap, yayın yapabilmek için önce bir Facebook Sayfası açıp Instagram'ını ona bağlamak zorunda kalıyordu. Kaybettiğimiz tek şey resumable upload; bizde medya zaten public bir adresten okunduğu için kayıp değil.

---

## 2. Kurulum

### 2.1 Meta uygulaması

1. `developers.facebook.com` → **Uygulama oluştur**
2. Ürünlerden **Instagram**'ı ekleyin → **API setup with Instagram login**
3. **Instagram App ID** ve **Instagram App Secret** değerlerini alın
4. **OAuth Redirect URI** olarak şunu ekleyin (birebir):
   `https://<backend-adresiniz>/social/instagram/callback`
   Yerelde: `http://localhost:3000/social/instagram/callback`
5. İzinler: `instagram_business_basic`, `instagram_business_content_publish`
   ve içerik analizi için `instagram_business_manage_insights` (bkz. §9 — yalnızca
   `INSTAGRAM_INSIGHTS=1` iken istenir)

> **App Review:** Her iki izin de inceleme ister. İnceleme öncesinde entegrasyon yalnızca uygulamada **rolü olan** (yönetici/geliştirici/test kullanıcısı) Instagram hesaplarıyla çalışır. Yani geliştirme sırasında kendi hesabınızla test edebilirsiniz, müşterileriniz inceleme onaylanana kadar bağlayamaz.

### 2.2 Ortam değişkenleri

```bash
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
INSTAGRAM_REDIRECT_URI=https://<backend>/social/instagram/callback
SOCIAL_TOKEN_ENC_KEY=$(openssl rand -base64 32)
# İsteğe bağlı: içerik analizinin izlenme/erişim metrikleri (§9).
# İzin Meta panelinde eklenip (canlı uygulamada App Review'dan geçip) ancak
# ondan SONRA açılmalı — aksi hâlde yetkilendirme ekranı herkes için düşer.
INSTAGRAM_INSIGHTS=1
```

`SOCIAL_TOKEN_ENC_KEY` yoksa entegrasyon **kapalı** sayılır: arayüzde "Instagram'ı bağla" düğmesi hiç görünmez. Jetonu saklayamayacakken düğme göstermek, "bağlandı ama yayımlayamıyor" gibi yarım bir duruma yol açardı.

> Anahtar kaybolursa bütün Instagram bağlantıları kopar ve hesapların yeniden bağlanması gerekir. Google/Microsoft anahtarlarından **bilerek ayrı**: biri sızarsa diğerleri etkilenmesin.

### 2.3 Veritabanı

`058_social_publishing.sql` çalıştırılmalı. İçinde `social-publish` adında **public** bir storage bucket oluşturulur — sebebi §4'te.

### 2.4 Hesabın kendisi

Bağlanacak Instagram hesabı **profesyonel** (İşletme veya İçerik Üretici) olmalı. Kişisel hesapların API erişimi yok.

---

## 3. Jeton yaşam döngüsü

Google'dan farklı, karıştırmayın:

```
kod → kısa ömürlü jeton (1 saat) → uzun ömürlü jeton (60 gün)
                                      ↑
                          yenileme AYNI jetonu uzatır
                          (ayrı bir refresh token YOK)
```

**Kritik kural:** uzun ömürlü jeton yalnızca **süresi dolmadan** ve en az 24 saatlikken yenilenebilir. Süresi geçmiş jeton yenilenemez — kullanıcı yeniden bağlanmak zorunda kalır.

Bu yüzden yenileme işi her gece 04:00'te çalışır ve **süre bitmesine 10 gün kala** devreye girer (`SocialTokensService.findExpiring`). Eşiğin geniş olmasının sebebi: iki hafta tatile çıkan bir kullanıcının bağlantısı kopmasın.

Jetonlar `social_account_tokens` tablosunda, AES-256-GCM ile şifreli. Tabloyu **yalnızca** `SocialTokensService` okur; hiçbir API yanıtı şifreli değeri bile taşımaz.

---

## 4. Medya neden public kovaya kopyalanıyor

Meta'nın kuralı net: *"we cURL media used in publishing attempts, so the media must be hosted on a publicly accessible server at the time of the attempt."* Yani görseli biz göndermiyoruz, Meta bizden **çekiyor**.

Bizim medyamız Drive/OneDrive'da ve oraya imzasız erişim yok. Çözüm:

```
Drive/OneDrive  →  social-publish kovası (public, uuid'li yol)  →  Meta cURL eder
                                    ↓
                        yayın biter bitmez silinir
```

Kova public olmak zorunda (Meta imzalı adres kullanamıyor), bu yüzden iki önlem var:

1. **Yol tahmin edilemez** — dosya adı rastgele uuid
2. **Kopya kısa yaşar** — yayın biter bitmez silinir; yarıda kalanları gece 04:30'daki süpürme işi 24 saat sonra toplar

Bu kalıcı bir ikinci arşiv değil, taşıma bandı.

---

## 5. Yayın akışı

```
1. Medya public adrese taşınır            (stageMedia)
2. Konteyner oluşturulur                  POST /<IG_ID>/media
   · tek görsel   → image_url
   · tek video    → video_url + media_type=REELS
   · 2-10 medya   → önce çocuk konteynerler, sonra media_type=CAROUSEL
3. Konteyner hazır olana kadar yoklanır    GET /<CONTAINER_ID>?fields=status_code
4. Yayımlanır                              POST /<IG_ID>/media_publish
5. Kalıcı adres okunur                     GET /<MEDIA_ID>?fields=permalink
6. Geçici kopyalar silinir
```

**Yayın hedef bazında yürür.** Üç hesaba giden bir içerikte biri hata verdiğinde diğer ikisi yayımlanmış olur; hata o hedefin satırında (`social_post_targets.error_message`) durur ve arayüzde o kanalın chip'inde görünür.

### Sınırlar ve kontroller

| Kural | Nerede kontrol ediliyor |
|---|---|
| En az bir medya (yalnızca metin gönderi yok) | Yayından önce, bizde |
| En fazla 10 medya | Yayından önce, bizde |
| **Yalnızca JPEG görsel** | Yayından önce, bizde — PNG dosya için anlaşılır hata verilir |
| 2200 karakter metin | Kırpılarak gönderilir |
| 24 saatte 100 yayın | `content_publishing_limit` sorgulanır; dolu ise 1 saat sonraya ertelenir |

> **JPEG kuralı bilinçli bir eksik:** PNG→JPEG çevirisi için yeni bir yerel bağımlılık (sharp) gerekiyordu ve sessiz kalite kaybı riski var. Kullanıcıya söylemeyi tercih ettik. Sık şikâyet gelirse çeviri eklenebilir.

> **"İlk yorum" otomatik eklenmiyor:** yorum yazmak ayrı bir izin istiyor (`instagram_business_manage_comments`). Alan formda duruyor, kullanıcı elle yapıştırıyor.

---

## 6. Zamanlanmış yayın

| Ne zaman | İş |
|---|---|
| Her 5 dakika | Kuyruk turu: `publish_at`'ı gelmiş hedefler yayımlanır |
| Her gün 04:00 | Süresi yaklaşan jetonlar yenilenir |
| Her gün 04:30 | Geçici medya artıkları süpürülür |

Kuyruğa **yalnızca yayın kararı verilmiş** içerik girer: durumu `ready`, `approved` ya da `scheduled` olanlar. Taslak bir gönderi, tarihi geçmiş olsa bile kendiliğinden çıkmaz.

`social_posts.scheduled_at` hedeflere **kopyalanır** (`social_post_targets.publish_at`). İki sebep: (1) yayımlanmış bir hedefin geçmişi, gönderi sonradan başka tarihe çekilince bozulmasın; (2) kuyruk tek tabloda, tek indeksle dönsün.

**Yeniden deneme:** geçici hatalarda üstel geri çekilme (2, 4, 8… dakika, en fazla 6 saat), 6 denemeden sonra kalıcı sayılır. Kalıcı hatalar (izin yok, jeton geçersiz, JPEG değil) hiç yeniden denenmez.

**Bildirim** yalnızca otomatik yayında gider: kullanıcı "Şimdi paylaş" dediyse sonucu zaten ekranda görüyor.

> ⚠️ **Çok örnekli kurulum:** cron her backend örneğinde ayrı çalışır ve aynı hedefi iki kez yayımlamayı deneyebilir. Bugünkü kurulum tek örnek (bkz. `render.yaml`). Ölçek büyüdüğünde kuyruk BullMQ'ya taşınmalı — bağımlılık projede zaten var.

---

## 7. Test etme

1. Meta uygulamanızda kendi Instagram hesabınıza **test kullanıcısı / geliştirici** rolü verin
2. Hesabı Instagram'da profesyonele çevirin
3. Modülde **Hesaplar → Instagram'ı bağla**
4. Bir içerik açın, **JPEG** bir görsel yükleyin, kanalı seçin
5. **Şimdi paylaş**

Sık karşılaşılanlar:

| Belirti | Sebep |
|---|---|
| "Instagram entegrasyonu yapılandırılmamış" | `INSTAGRAM_APP_ID` / `SECRET` / `SOCIAL_TOKEN_ENC_KEY` eksik |
| Meta "Invalid redirect_uri" | Panel'deki URI ile `INSTAGRAM_REDIRECT_URI` birebir aynı değil (sondaki `/` dahil) |
| "Yalnızca JPEG görsel kabul ediyor" | PNG/WebP yüklenmiş |
| "Application does not have permission" | İzinler App Review'dan geçmemiş ya da hesabın uygulamada rolü yok |
| Konteyner `ERROR` | Görsel oranı/boyutu Instagram'ın kabul ettiği aralık dışında |

---

## 8. Sıradaki adımlar

1. ~~**Insights senkronu**~~ — §9'da yapıldı (ayrı tabloya; `social_posts.reach/engagement` elle girilen alanlar olarak kaldı)
2. **Story ve trial reels** — `media_type=STORIES` ve `trial_params` desteği
3. **İlk yorum** — `instagram_business_manage_comments` izniyle otomatikleşir
4. **PNG→JPEG çevirisi** — sharp bağımlılığı kabul edilirse
5. **Diğer platformlar** — LinkedIn ve X aynı iskelete oturur: `SocialPublishService` platformdan bağımsız, yalnızca bir `switch` kazanır

---

## 9. İçerik analizi (Analiz ve fikirler sekmesi)

Migration: `145_icerik_analizi.sql` · Kod: `instagram-insights.service.ts` (Meta),
`icerik-analizi.service.ts` (uçlar + Lio), `icerik-analizi.ts` (saf kurallar),
`packages/shared/src/icerikAnalizi.ts` (performans hesabı — arayüzle ortak),
arayüz `apps/web/src/components/sosyalAnaliz/`.

| Parça | Ne yapar |
|---|---|
| Senkron | Bağlı hesabın son 150 gönderisi (`/me/media`) + gönderi başına Insights. Her gece 05:15, bağlandıktan hemen sonra ve "Şimdi güncelle" ile (en sık 10 dk'da bir). Tur başına en fazla 60 Insights çağrısı — çağrı bütçesi yayınla ortak. |
| Performans | Her gönderi **kendi hesabının medyanıyla** kıyaslanır ("normalin 3,2 katı"). İlk 48 saat kıyas dışı ("yeni"). |
| Lio gönderi analizi | Videoyu Meta'dan taze adresle indirir, kare + ses → "neden böyle gitti, sürdür, geliştir". Sonuç `lio_analiz`'e yazılır (bakiye bir kez harcanır). |
| İlham panosu | Kullanıcının **elle** eklediği hesap/içerik: bağlantı, not, etiket, isteğe bağlı referans dosyası. Lio "neden işliyor, sana nasıl uyar" der. |
| Benzer hesap bul | İlham panosunun üstünde. Lio nişi çıkarır, **Anthropic sunucu tarafı web aramasıyla açık web'de** (listeler, haberler, bloglar) aday hesap arar — en fazla 5 arama. Aday ancak kaynağı bu keşifte gerçekten dönen bir arama sonucuysa "doğrulandı"; değilse kaynağı gösterilmez ve kart uyarır. Sonuç `social_discoveries`'e yazılır (migration 146). Kod: `benzer-hesap.ts` (saf), `benzer-hesap.service.ts`. Yalnızca Anthropic sağlayıcısı tanımlıyken açık; arama başına ücret `AI_WEB_SEARCH_USD_PER_SEARCH` (varsayılan 0,01 USD) + model kullanımı — bir keşif ≈ 0,2-0,35 USD. |
| Fikir raporu | Metin modeli: en iyi/en zayıf gönderiler + analizler + ilhamlar → kalıplar ve fikirler. `social_idea_reports`'a yazılır; her fikir takvime "fikir" durumunda içerik olarak eklenebilir. |

**Başka hesapların verisi otomatik çekilmez.** Resmi yolu (Business Discovery,
Hashtag Search) yalnızca Facebook Login yolunda var ve Sayfa istiyor (§1);
kazıma Instagram koşullarına aykırı. İleride Facebook Login ikinci, isteğe bağlı
bir bağlantı olarak eklenirse rakip takibi oraya oturur.

**Metrik izni bayrakla açılır** (`INSTAGRAM_INSIGHTS=1`). Kapalıyken sekme
çalışır ama yalnızca beğeni/yorum sayılarıyla. Açıldıktan sonra, önceden
bağlanmış hesaplar "Yeniden bağla" uyarısı görür (jetonlarında izin yok);
yayınları etkilenmez.

Sık karşılaşılanlar:

| Belirti | Sebep |
|---|---|
| "İçerik analizi bu sunucuda henüz etkin değil" | Migration 145 uygulanmamış |
| "İzlenme ve erişim verileri bu kurulumda henüz açılmadı" | `INSTAGRAM_INSIGHTS` tanımsız |
| "Yeniden bağla" uyarısı | Hesap bayrak açılmadan önce bağlanmış |
| Tek gönderide "metrikleri okunamadı" | Gönderi hesap profesyonele geçmeden atılmış ya da Meta o tür için metriği desteklemiyor — diğerlerini etkilemez |

