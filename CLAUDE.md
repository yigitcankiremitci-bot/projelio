# Projelio — Claude çalışma rehberi

npm workspaces monorepo. Genel tanıtım ve kurulum için `README.md`'ye bak — burada
yalnızca koda bakarak çıkarılamayacak şeyler var.

## Nerede ne var

Dosya ararken önce buraya bak; `grep`/`find` ile taramadan önce doğru klasöre git.

| Ne | Nerede |
|---|---|
| Backend iş mantığı | `backend/src/modules/<modül>/<modül>.service.ts` |
| Backend HTTP uçları | `backend/src/modules/<modül>/<modül>.controller.ts` |
| Veritabanı erişimi | `backend/src/database/supabase.service.ts` (ORM yok) |
| Yetki/erişim kuralları | `backend/src/common/access/`, `backend/src/common/guards/` |
| Web sayfaları (route) | `apps/web/src/pages/` |
| Web bileşenleri | `apps/web/src/components/` |
| Web yardımcıları / hook'lar | `apps/web/src/lib/` |
| HTTP istemcisi, hata tipi, oturum | `apps/web/src/api/client.ts` |
| Web+mobil+backend ortak tipler | `packages/shared/src/types.ts` |
| SQL migration'lar | `database/migrations/NNN_ad.sql` |
| Geri alma betikleri | `database/geri-al/` — migrations'ın DIŞINDA, bilerek |
| Dağıtım/yedek/migration betikleri | `deploy/` |
| Bulut depolama (Drive/OneDrive) | `backend/src/modules/cloud-storage/` — iki sağlayıcının önündeki tek kapı |
| API referansı | `docs/api-endpoints.md` (seçilmiş uçlar) + `node scripts/uc-listesi.mjs` (tam liste) |
| Modül sistemi tasarımı | `docs/moduller/` — 20 belge; README'de faz tablosu |
| Tanıtım sitesi (Next.js) | `landing/` |
| Abonelik / ödeme (iyzico + mağazalar) | `backend/src/modules/billing/` — kurulum `docs/odeme-kurulumu.md` |
| Bildirim e-postaları | `backend/src/modules/notifications/notification-email.*` — tercih, şablon, iki turlu işleyici |
| Yaptım (kişisel iş günlüğü) | `backend/src/modules/worklog/`, `apps/web/src/pages/WorkLog.tsx` — Yapılacaklar'ın tersi |
| Bütçe (tüm kademeler) | `backend/src/modules/budget/` — tek defter, bkz. aşağıdaki başlık |
| Bilgi kartı (şirket/iş künyesi) | `backend/src/modules/bilgi-karti/`, `apps/web/src/components/bilgiKarti/` — künye + belge + diğer modüllerden özet |
| Hesaplar (üyelikler + şifreli giriş bilgileri) | `backend/src/modules/hesaplar/`, `apps/web/src/components/hesaplar/` — sır yalnızca `hesap-kimlik.service.ts`'ten çıkar |
| Geçiş anahtarı (WebAuthn) doğrulaması | `backend/src/common/webauthn/` — elle yazıldı, bağımlılık yok; `backend/src/modules/passkeys/` kullanıcının cihazları |
| Admin kullanıcı yönetimi (askı, oturum iptali, kredi, silme) | `backend/src/modules/admin/admin-kullanicilar.service.ts`, `apps/web/src/components/AdminKullanicilarPanel.tsx` — oturum engeli `backend/src/common/hesap-durumu/` |
| WhatsApp köprüsü (WAHA yan-servisi + modül) | `backend/src/modules/whatsapp/`, `deploy/docker-compose.prod.yml` `waha` servisi, tasarım `docs/whatsapp-qr-plan.md` |

Backend'de 48 modül, 500'den fazla HTTP ucu var (`node scripts/uc-listesi.mjs` ile
listelenir — elle yazılmış liste bayatlıyor). Lio =
`modules/ai-assistant/`; araç tanımları `ai-assistant.tools.ts`, kredi sistemi
`ai-credits.service.ts` + `ai-credits.config.ts`, sağlayıcı katmanı
`ai-assistant/providers/`.

**Lio çok sağlayıcılıdır.** Model çağrısı doğrudan Anthropic SDK'sına değil,
`providers/provider-registry.ts` üzerinden gider. Yeni sağlayıcı ya da model
eklemek = `providers/providers.config.ts` içindeki `PROVIDER_CATALOG`'a bir
satır. **Fiyat da o satırda** — `MODEL_PRICING` katalogdan besleniyor, ikinci
bir liste tutulmuyor. OpenAI ya da Anthropic uyumlu API sunan her sağlayıcı
(z.ai/GLM, MiniMax, DeepSeek, Groq, OpenRouter, Ollama) kod yazmadan eklenir;
yalnızca bu iki biçime de uymayan bir sağlayıcı için `LlmProvider` arayüzünü
uygulayan yeni bir sınıf gerekir.

Sağlayıcı listesi, öncelik sırası, model seçimi ve KVKK notu için aşağıdaki
"Sunucuda elle kurulması gerekenler" başlığına bak.

Kanonik istek biçimi **Anthropic Messages biçimidir**: 68 araç tanımı ve tüm
servis kodu o dilde yazılmış, çeviri yükü yalnızca onu gerektiren sağlayıcıya
biniyor (`providers/openai-format.ts`, testleri `openai-format.test.ts`).

**Dosyanın sahibi üç şeyden biridir: iş, departman ya da şirket.** İş kapsamının
altında proje/görev/çıktı hiyerarşisi ve ona karşılık gelen klasör ağacı var;
departman ile şirket ise "düz kapsam" (`FlatScope`, `files.service.ts`): tek,
alt klasörsüz bir klasör + kadroya verilen bulut izinleri. İkisinin gövdeleri
ORTAK — departman için bir düzeltme yazıp şirketi unutmak mümkün değil.

**Bir kullanıcı birden fazla Drive/OneDrive hesabı bağlayabilir** (migration 088).
Hangi hesabın kullanılacağı şirket bazında seçilir (`organization_storage`,
Organizasyonu düzenle > Dosya deposu); seçim yoksa eski davranış sürer: sahibin
varsayılan hesabı. Bir hesabın giriş kimliği mi yoksa yalnızca depo mu olduğu
`is_login_identity` ile ayrılır — depo hesabıyla Projelio'ya GİRİŞ YAPILAMAZ,
aksi hâlde şirketine Drive bağlayan herkes hesabına ikinci bir anahtar takmış
olurdu.

`apps/mobile` (Expo) neredeyse boş — asıl istemci `apps/web`.

`landing/` = Next.js tanıtım sitesi (projelio.app). Bu repoda ama npm
workspace'i DEĞİL: kendi `package.json` ve `package-lock.json`'ı var, kök
`npm install` ona dokunmaz. Vercel'de ayrı bir proje olarak, Root Directory
`landing` verilerek yayımlanır.

Kardeş klasör `../projelio-whatsapp` ayrı bir projedir, bu repoya dahil değil.

## Komutlar

```bash
npm run dev          # backend + web birlikte (concurrently)
npm test             # tüm testler
npm test -- --filter=access   # yalnızca eşleşen testler
npm run typecheck    # backend + web tsc --noEmit
npm run yayinla      # kontrol et + onay al + push'la + yayını izle
```

## Yayın nasıl oluyor (yerelde çalış, sonra yayınla)

**Canlıya çıkmanın tek yolu main'in origin'e push'lanmasıdır.** Dosya kaydetmek,
commit atmak, dal açmak canlıya hiçbir şey göndermez — istediğin kadar birikir.

Push'landıktan sonra zincir kendi işler: GitHub Actions `ci.yml` koşar → VPS'teki
`projelio-deploy.timer` dakikada bir bakar, **yalnızca CI'ı yeşil olan** commit'i
alır, imajları derleyip `docker compose up -d` yapar.

Kritik ayrıntı: **CI kırmızıysa hiçbir yerde hata görünmez**, zamanlayıcı
sessizce hiçbir şey yapmaz ve canlı eski hâlinde kalır. Bu yüzden push'u
doğrudan atmak yerine `npm run yayinla` (bkz. `deploy/yayinla.sh`) kullan:
commit'lenmemiş dosya var mı bakar, CI'ın koşacağı typecheck + testleri yerelde
koşar, ne gideceğini gösterip onay ister, sonra CI ve dağıtımı izler.

Migration'lar bu zincire DAHİL DEĞİL — hâlâ elle uygulanıyor (bkz. aşağıda).

**⚠️ Tailscale anahtarı 2027-02-25'te doluyor.** Sunucuya SSH yalnızca tailnet
üzerinden (`projelio@100.111.242.24`) yapılıyor; 22 numaralı port genel IP'de
kapalı. Anahtar yenilenmezse erişim tamamen kopar ve geriye yalnızca sağlayıcı
konsolu kalır. Kalıcı çözüm: Tailscale panelinden bu makineye *"Disable key
expiry"* işaretlemek (altyapı düğümleri için önerilen yol).

Sunucuda **root yok**: `projelio` kullanıcısı sudoers'da değil ve yerel anahtar
root girişini açmıyor. Bu yüzden sunucuda kurulan her şey (ör. yedekleme)
kullanıcı crontab'ıyla kuruluyor, systemd birimiyle değil — birimler repoda
duruyor ama root erişimi olduğu gün işe yarar. Bkz. `deploy/yedekle.sh` başlığı.

### Sunucuda elle kurulması gerekenler (kod tarafı hazır, ayar bekliyor)

Bunlar repoda var ama **ortam değişkeni tanımlanana kadar sessizce kapalı**:

| Ne | Değişken | Nerede tanımlanır |
|---|---|---|
| Yedeğin dış kopyası | `PROJELIO_UZAK_HEDEF` | crontab / `~/uyari.env` |
| Arıza bildirimi | `PROJELIO_NTFY_KONU` ya da `PROJELIO_TELEGRAM_TOKEN`+`_CHAT` | `/etc/projelio/uyari.env` ya da `~/uyari.env` |
| Yedek yaşam sinyali | `PROJELIO_YEDEK_PING` | aynı dosya |
| WhatsApp'tan Lio'ya komut | `WHATSAPP_LIO_KOMUT=1` | `backend/.env` |
| Lio'nun AI sağlayıcı sırası | `AI_PROVIDERS` | `backend/.env` (ya da Admin paneli) |
| Abonelik tahsilatı | `IYZICO_API_KEY` + `IYZICO_SECRET_KEY` | `backend/.env` (plan kodları Admin panelinde) |
| Hesap şifrelerinin şifrelenmesi | `HESAP_KIMLIK_ENC_KEY` | `backend/.env` — **eksikse giriş bilgisi kaydedilemez** |
| Gönderen e-posta adresi | `EMAIL_FROM` | `backend/.env` — **eksikse Resend kum havuzuna düşer** |
| Yönetici mesajlarının göndereni (isteğe bağlı) | `EMAIL_FROM_DESTEK` | `backend/.env` — tanımsızsa EMAIL_FROM alan adında `destek@` |
| Tek tık "aboneliği bırak" | `API_PUBLIC_URL` | `backend/.env` |
| Mağaza abonelikleri | `APPSTORE_*` / `PLAY_*` | `backend/.env` |

`AI_PROVIDERS` sağlayıcıları hem **açar** hem **sıralar** — virgülle ayrılmış,
soldan sağa öncelikli:

```
AI_PROVIDERS=anthropic          # varsayılan (değişken tanımsızsa da bu)
AI_PROVIDERS=anthropic,zai      # önce Anthropic, düşerse z.ai
AI_PROVIDERS=zai,anthropic      # önce ucuz olan, yedek Anthropic
```

Bir sağlayıcının anahtarı (`ANTHROPIC_API_KEY`, `ZAI_API_KEY`,
`MINIMAX_API_KEY`) tanımlı değilse listede olsa bile atlanır — log'a uyarı
düşer. Yedeğe geçiş yalnızca **geçici** hatalarda olur (429, 5xx, bağlantı ve
sağlayıcıya özgü 401/404); 400'de geçilmez, çünkü bozuk istek her sağlayıcıda
bozuktur. Kredi, yedeğe geçilirse **gerçekten kullanılan** modelin fiyatından
kesilir.

### Model seçimi — KARAR YÖNETİCİDE

Kullanıcı model ya da kademe seçemez. Eskiden seçebiliyordu ve iki sorun
vardı: `POST /ai/chat` gövdesindeki `model` alanı korumasızdı (herkes Opus'u
çalıştırabiliyordu), kademe seçimi de faturayı 15 kata kadar değiştiriyordu.
İkisi de tercih değil **maliyet kararı**.

Sunucu artık kullanıcıdan gelen `tier` ve `model` alanlarını **yok sayar**.
Alanlar imzalarda duruyor ama kullanılmıyor — güncellenmemiş istemcilerin
isteklerini reddetmek yerine sessizce yok saymak doğru davranış.

Yönetici kararı iki yerden verebilir:

| Yol | Nasıl | Ne zaman |
|---|---|---|
| Admin paneli | Admin > AI sağlayıcıları > Kademe ve model seçimi | Olağan yol; SSH gerekmez |
| Ortam değişkeni | `AI_PROVIDERS`, `AI_MODEL_<SAĞLAYICI>_<KADEME>` | Panel erişilemezse |

Öncelik: veritabanı ayarı > ortam değişkeni > kod varsayılanı. Tablo boşsa ya
da bir satır yoksa eski davranış aynen sürer, yani migration 086 tek başına
hiçbir şeyi değiştirmez. Tablolar okunamazsa (ör. migration uygulanmadan)
asistan **durmaz**, kod varsayılanına düşer.

Seçim kaydedilirken katalogda var mı diye doğrulanır: geçersiz bir kayıt
asistanın HER isteğinde sağlayıcıdan 404 almasına yol açardı ve sebebi panelde
görünmezdi (`ai-model-settings.service.ts`, testleri `ai-model-settings.test.ts`).

`GET /ai/models` artık yalnızca `maxAttachments` döner — seçim hakkı olmayan
kullanıcıya model listesi göstermek anlamsız. Model listesi yalnızca yönetici
ucundan gelir: `GET /ai/admin/model-settings`.

### Katalogdaki modeller (Eylül 2026 liste fiyatları, USD/milyon token)

| Sağlayıcı | Model | Giriş | Çıkış | Bağlam | Görsel |
|---|---|---|---|---|---|
| Anthropic | Claude Haiku 4.5 | 1 | 5 | 200K | ✓ |
| Anthropic | Claude Sonnet 5 | 3 | 15 | 200K | ✓ |
| Anthropic | Claude Opus 5 | 15 | 75 | 200K | ✓ |
| z.ai | GLM 5.3 Flash | 0,075 | 0,25 | 200K | — |
| z.ai | GLM 4.7 FlashX | 0,07 | 0,4 | 128K | — |
| z.ai | GLM 5.3 | 1,4 | 4,4 | 1M | — |
| z.ai | GLM 4.7 | 0,6 | 2,2 | 200K | — |
| z.ai | GLM 4.6V | 0,3 | 0,9 | 64K | ✓ |
| z.ai | GLM 5.2 | 1,4 | 4,4 | 200K | — |
| MiniMax | M2.7 Hızlı | 0,3 | 1,2 | 200K | — |
| MiniMax | M2.7 | 0,3 | 1,2 | 200K | — |
| MiniMax | M3 | 0,3 | 1,2 | 1M | ✓ |

Fiyatların **tek kaynağı** `providers.config.ts`; `MODEL_PRICING` oradan
besleniyor (`catalogPricing()`). Katalogda fiyatı olmayan model
DEFAULT_PRICING'e (15/75 USD) düşer ve müşteriden gerçeğin kat kat üstünde
kredi kesilir — bir test bunu yakalıyor (`providers.config.test.ts`).

MiniMax **Anthropic uyumlu uç** (`/anthropic`) sunduğu için `kind: "anthropic"`
ile bağlandı: çeviri katmanı devreye girmiyor, araç akışı Anthropic'le birebir
aynı yoldan geçiyor. z.ai OpenAI uyumlu olduğu için `openai-format.ts`
çevirisinden geçer.

Durumu görmek için `GET /ai/health`: hangi sağlayıcılar tanımlı, hangileri
etkin, hangi model kullanılıyor.

⚠️ **Anthropic dışı sağlayıcılar bilinçli olarak varsayılan DEĞİL.** İkisi de
(MiniMax, z.ai) Çin merkezli; müşteri verisi (görev içerikleri, dosya adları,
WhatsApp mesajları) oraya gider. KVKK açısından bu teknik değil ticari/hukuki
bir karar — açmadan önce bilerek karar ver.

**⚠️ `EMAIL_FROM` tanımsızsa e-posta fiilen çalışmaz.** Kod
`onboarding@resend.dev` yedeğine düşer; Resend bu adreste yalnızca hesap
sahibine göndermeye izin verir ve diğer TÜM alıcılara 403 döner — doğrulama,
şifre sıfırlama ve bildirim e-postaları sessizce ulaşmaz, sahibe giden tek
kopya da ortak alan adından çıktığı için spam'e düşer. Üretimde aylarca böyle
kaldı. Açılışta artık uyarı düşüyor (bkz. `assertRequiredEnv`).

Kurulum adımları `deploy/yedekle.sh` ve `deploy/uyar.sh` başlıklarında yazılı.
Dış kopya kurulana kadar yedekler **yalnızca korumaya çalıştıkları diskte**
duruyor. Ayrıca dışarıdan bir uptime izleyicisi `https://api.projelio.app/health/ready`
adresine bakmalı — `/health` yalnızca sürecin ayakta olduğunu söyler,
veritabanı ölüyken bile 200 döner.

Değişiklik sonrası **her zaman `npm run typecheck` çalıştır.** Tüm test setini
değil, dokunduğun alanın testlerini `--filter` ile koştur.

## Abonelik ve ödeme

Paketler (Starter / Pro / Business) `backend/src/modules/billing/`'de. Kurulum
adımları ve iyzico paneli işleri: `docs/odeme-kurulumu.md`.

**Fiyatın tek kaynağı `billing.plans.ts`.** Vitrin fiyatı USD; tahsilat TRY ve o
tutar **iyzico'nun ödeme planında sabittir**, canlı kurla hesaplanmaz. Kur canlı
olsaydı kullanıcıya gösterilen tutarla çekilen tutar her an ayrışırdı; abonelikte
fiyat bir kez sabitlenir. Fiyat değiştirmek = iyzico'da **yeni plan açmak**; yeni
referans kodu Admin panelinden `billing_plan_refs`'e yazılır, eski aboneler eski
tutarla devam eder.

Tanıtım sitesi (`landing/`) npm workspace'i olmadığı için kataloğu içe aktaramaz;
fiyatı `GET /billing/public/plans` ucundan okur ve API kapalıysa sözlükteki yedek
kopyaya düşer. **Fiyatı landing'e elle yazma.**

Değişmez kurallar:

- **Abonelik satırı açmak kredi yüklemez.** Kredi tek yoldan geçer ve dönem
  başına bir kez yüklenir — `subscription_credit_grants(subscription_id,
  period_start)` tekil indeksi ikinciyi veritabanı düzeyinde reddeder.
- **Yıllık abone parayı yılda bir öder, krediyi her ay alır.** Ay sınırını
  gecelik iş geçirir (`billing-renewal.processor.ts`, 03:20). Kredi ayı abonelik
  tarihine sabitlenir (ayın 7'sinde abone olan her ayın 7'sinde alır).
- **`past_due` hak vermeye devam eder.** Tek bir başarısız çekim yüzünden erişimi
  kesmek geri kazanılamayan bir müşteri kaybıdır; iyzico zaten yeniden deniyor.
- **Ödemenin kanıtı sağlayıcının API'sidir**, tarayıcının callback'e dönmesi
  değil — o adrese elle de gidilebilir.
- **Mağaza (Apple/Google) doğrulaması bildirimle değil, mağazaya sorularak
  yapılır.** İstemciden gelen `originalTransactionId` / `purchaseToken` bir
  kimliktir, kanıt değil. Bu yüzden mağaza bildirimlerinin imzası doğrulanmıyor:
  karar zaten bildirime dayanmıyor.
- **`IYZICO_BASE_URL` tanımsızsa kum havuzu** kullanılır. Varsayılanı üretim
  yapmak, yarım kalmış bir kurulumda gerçek kartlardan para çekmek demekti.

Kredi *paketleri* (tek seferlik yükleme, `ai_credit_orders`) ayrı ve duruyor:
abonelik onun yerine değil, yanına geldi.

## Bütçe: tek defter, beş kademe

**Para TEK TABLODA: `budget_transactions`.** Şirketin ayrı bir "Gelir-Gider"
modülü vardı (`fm_gelir_gider`, `module_records`); kaldırıldı ve kayıtları
buraya taşındı (migration 104). Sebebi çift sayımdı: aynı 10.000 TL hem proje
bütçesine hem o modüle girilebiliyor, yönetim 20.000 TL görüyordu.

Hiyerarşi ve toplama yönü:

```
görev bütçesi (tasks.budget, onaylanıp ödenince)
  └─ proje / rutin
      └─ iş ────────────┐
      departman ────────┤
                        └─ organizasyon
                             └─ holding (groups)
```

**Kademeler birbirini TOPLAR, kopyalamaz.** Bir satır yalnızca tek bir kademeye
aittir — `budget_tx_single_parent` kısıtı (`num_nonnulls(...) <= 1`) bunu
veritabanı düzeyinde garanti ediyor. Ürünün finansal güvenilirliği bu tek
cümleye dayanıyor; kısıtı gevşetmek çift sayımı geri getirir.

| Ne | Nerede |
|---|---|
| Toplama (saf fonksiyonlar) | `packages/shared/src/butceToplama.ts` — sunucu ve arayüz aynı koddan geçer |
| Kademe toplaması | `backend/src/modules/budget/butce-hiyerarsi.service.ts` |
| Yetki kararı (saf) | `backend/src/modules/budget/butce-erisim.ts` |
| Defter işlemleri (4 kademe ortak) | `backend/src/modules/budget/butce-kademe.service.ts` |
| Görev bütçesi onayı | `backend/src/modules/budget/gorev-butce.service.ts` |
| Arayüz (4 kademe ortak) | `apps/web/src/components/butce/ScopeBudgetPanel.tsx` |

Uçlar: `GET /budget/scope/:scopeType/:scopeId` sayfanın TÜM verisini tek seferde
döner (`scopeType` = job | department | organization | group). Hareketlerin
düzenlenmesi ve silinmesi buradan değil, `/budget/transactions/:id` ucundan —
kaydın kademesi zaten satırın kendisinde yazılı ve kuralın ikinci bir kopyası
çıkmasın diye.

Değişmez kurallar:

- **Kur dönüşümü YOK.** Defter çok para birimli; toplamlar birim başına ayrı
  hesaplanır. "1.000 USD + 1.000 TRY = 2.000 ₺" her zaman yanlıştır ve kur
  kaynağı olmadan doğrusu üretilemez. Kişisel Kasa tek toplam gösterdiği için
  orada yalnızca ₺ kayıtlar toplanır, döviz kayıtlar listede kendi birimiyle
  görünür.
- **Onay ile ödeme AYRI adımlar.** Onay (`planned`) bir taahhüttür, bütçeyi
  bağlar ama kasadan para çıkarmaz; ödeme (`paid`) deftere gerçek bir `payout`
  satırı yazar. Tek adım olsaydı nakit akışı grafiği gerçekte olmayan çıkışlar
  gösterirdi. Ödenen görev deftere düştüğü için **ayrıca toplanmaz** — iki
  kez saymak olurdu.
- **Onay yetkisi satın alınamaz.** `budget_viewers`'a eklenen kullanıcı
  `can_manage` ile kayıt girebilir ama görev bütçesi ONAYLAYAMAZ; onay
  kademenin sahibine/yöneticisine özgüdür.
- **Taşeron hiçbir kurumsal bütçeyi göremez** — `budget_viewers`'a yanlışlıkla
  eklenmiş olsa bile (bkz. `butceYetkisiKarari`, taşeron kontrolü her şeyden
  önce gelir).
- **Kaydın kaynağı `source` sütununda**: `manual` (elle girildi) · `task_budget`
  (onaylanan görev bütçesi ödenince üretildi) · `recurring` (düzenli ödemenin
  vadesi gelince üretildi). Otomatik satırların görev bağı DEĞİŞTİRİLEMEZ —
  o bağ satırın var olma sebebi, koparılırsa "ödemeyi geri al" onu bulamaz.
- **Otomatik ödeme satırı görev başına BİR TANEDİR** —
  `budget_transactions_task_odeme_uniq`, `task_id` üzerinde ama yalnızca
  `source = 'task_budget'` satırlarına uygulanan KISMİ tekil indeks.
  "Ödendi"ye iki kez basmak gideri iki kez yazmasın diye. Elle bağlanan
  kayıtlar serbest: aynı göreve birden çok masraf yazmak normaldir.
- **Kayıt üst bir sayfadan girilip ALT bir kademeye yazılabilir** ("bu gider
  aslında şu projeye ait" — `hedefTur`/`hedefId`, bkz. `ButceKademeService.hedefiCoz`).
  Hedef, açık olan kademenin altında olmak ZORUNDA. Üstteki toplamı bozmaz:
  alt kademe zaten üste toplanıyor, yani kayıt aşağı indiğinde şirketin rakamı
  değişmez, yalnızca detaylanır. Seçenekler `GET .../targets` ucundan gelir;
  görevler o listede YOK (bir holdingin altında binlerce olabilir), kademe
  seçildikten sonra kendi ucundan yükleniyor.
- **Tekrar aralıkları**: haftalık · aylık · 3 aylık · 6 aylık · yıllık. Ay
  ekleyenlerin hepsi aynı koddan geçer (`vade.ts`): çapa gün korunur, ay sonu
  taşmaz. Etiketler ve sıra `RECURRENCE_INTERVAL_LABEL` / `RECURRENCE_INTERVALS`
  içinde — bileşene kopyalama, 3/6 aylık eklenince o kopyalar eksik kalmıştı.
- **Tek seferlik bir kayıt düzenliye çevrilebilir**
  (`POST /budget/transactions/:id/recurring`). Kayıt SİLİNMEZ — o para gerçekten
  çıktı; yeni düzenli ödeme BİR SONRAKİ vadeden başlar, yoksa aynı ay iki kez
  işlenirdi.
- `fm_alacak_borc` bilerek MODÜL olarak kaldı: orada henüz gerçekleşmemiş para
  var ve hiçbir bakiyeye girmez.
- Türev paneller (Finansal Analiz, Yönetim Analizi) deftere `BUTCE_DEFTERI`
  sanal kaynak anahtarıyla bakar (`apps/web/src/lib/panelConfigs/types.ts`):
  bir modül değil, hareketlerin panel biçimine çevrilmiş hâli.

## Bu repoda geçerli konvansiyonlar

- **ORM yok.** Veri erişimi Supabase JS client üzerinden, `supabase.service.ts`
  ile. Entity/repository aramaya kalkma, yok.
- **Test koşucusu Node'un yerleşiği** (`node --test`), vitest/jest yok ve
  eklenmeyecek. Test dosyaları kaynağın yanında: `taskFocus.ts` →
  `taskFocus.test.ts`. Yeni bağımlılık eklemeden yaz.
- **ESLint/Prettier yok.** Mevcut dosyanın stilini taklit et, formatlayıcı çalıştırma.
- **Yorumlar Türkçe ve "neden"i anlatır.** Bir davranışın nedenini açıklayan uzun
  yorumları silme — çoğu geçmişte yaşanmış bir hatayı belgeliyor. Yeni yorumları
  aynı dilde ve aynı üslupta yaz.
- **Kullanıcıya görünen tüm metinler Türkçe.**
- **Renkler tek yerden gelir:** `packages/shared/src/theme.ts` — açık ve koyu tema
  paletleri orada tanımlı (`accent: #C0813F`, ana `#3E4858`). Yeni renk uydurma,
  bileşene sabit hex yazma; paletten al.

## Dikkat edilecekler

- **Migration numaraları çakışabiliyor** — `019`, `027`, `043`, `044`, `051`,
  `058`, `060`, `063` iki kez kullanılmış (hepsi farklı tablolara dokunduğu için
  zararsız). Yeni migration eklerken `ls database/migrations | tail` ile en
  yüksek numarayı gör ve bir sonrakini al.
- **Geri alma (rollback) betikleri `database/geri-al/` altında**, migrations
  içinde DEĞİL. Aynı numarayı taşıyorlardı ve sıralı toplu uygulamada ileri
  migration'ı hemen ardından geri alıyorlardı (bkz. `database/geri-al/README.md`).
- **Migration'lar kendi VPS'imizdeki Postgres'e elle uygulanıyor** (Supabase'e
  değil — 2026-08-30'da göç edildi). Dosyayı yazmak yeterli değil; uygulanması
  gerektiğini bana hatırlat. Tercih edilen yol `deploy/migrate.sh`:

  ```bash
  ./deploy/migrate.sh durum     # bekleyenleri listeler
  ./deploy/migrate.sh uygula    # sırayla uygular, kaydeder, PostgREST'i tazeler
  ```

  Betik `schema_migrations` tablosunu (migration 083) kullanır: uygulanmışları
  atlar, her dosyayı tek transaction'da çalıştırır, sonradan değiştirilmiş
  dosyaları yakalar. **İlk kurulumda** önce 083'ü elle uygula, sonra
  `./deploy/migrate.sh isaretle` ile mevcut 82 dosyayı "uygulanmış" say.

  Elle uygulamak gerekirse:
  `ssh projelio@100.111.242.24 'docker exec -i projelio-postgres sh -c "psql -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB"' < database/migrations/NNN_ad.sql`
  (tailnet adresi; genel IP'de 22 kapalı). Şema değiştiyse PostgREST'in
  önbelleğini tazele: `docker exec projelio-postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"notify pgrst, 'reload schema'\""`
- **`client.ts` içindeki oturum sonlanma mantığına dokunma.** 401'lerin tek
  merkezden yönetilmesi bilinçli; oraya `catch` eklemek "her şeyim silinmiş"
  hatasını geri getirir.
- **Bildirim gönderirken `notifyUserSafe` kullan**, `notifyUser` değil.
  `notifyUser` veritabanı hatasında `throw` ediyor; beklenmeden bırakılırsa
  Node 22 yakalanmamış promise reddinde SÜRECİ ÖLDÜRÜR. Sonucu gerçekten
  beklemen gerekmiyorsa (ki bildirimlerde neredeyse hiç gerekmez) güvenli olanı
  çağır. `main.ts`'te güvenlik ağı var ama oraya düşen her kayıt bir eksik
  catch demektir.
- **Dış servise giden her `fetch` zaman aşımlı olmalı** —
  `common/http/fetch-with-timeout.ts`. Node'un fetch'inde yanıt için varsayılan
  zaman aşımı YOK; asılı kalan bir istek kuyruk işleyicisini (`running` bayrağı)
  süresiz kilitleyebiliyor. Veritabanı çağrıları için aynı koruma
  `backend/src/database/retrying-fetch.ts` içinde zaten var.
- **Liste uçlarına tavan koy** — `common/liste-tavani.ts`. Kod tabanında gerçek
  sayfalama yok; tavan, veri beklenmedik biçimde büyüdüğünde kopmayı önlüyor.
- **Büyük dosyalar** — bunları tamamen okumaya çalışma, ilgili bölümü hedefle:
  `files.service.ts` (~1900), `planning.service.ts` (~1600),
  `TaskColumn.tsx` (~1500), `ai-assistant.service.ts` (~1300),
  `tasks.service.ts` (~1250).
- `.env` dosyaları repoda mevcut ve gerçek anahtar içeriyor. İçeriğini yazdırma,
  paylaşma, commit'e ekleme.

## Yeni backend modülü eklemek

1. `backend/src/modules/<ad>/` altında `<ad>.module.ts`, `<ad>.controller.ts`,
   `<ad>.service.ts` oluştur — komşu bir modülü örnek al. (`dto/` klasörü yalnızca
   3 modülde var, varsayılan değil.)
2. `backend/src/app.module.ts` içine kaydet.
3. Şema değişiyorsa `database/migrations/` altına yeni numaralı SQL ekle.
4. Ortak tip gerekiyorsa `packages/shared/src/types.ts`'e koy, kopyalama.
5. Web tarafında çağrıyı `apps/web/src/api/` altına ekle.
6. `npm run typecheck` + ilgili testler.

## Benimle çalışırken (bağlam/token disiplini)

- Görev dar tanımlıysa keşif yapma; doğrudan dosyayı aç ve düzenle.
- Geniş araştırma gerekiyorsa **subagent kullan**, dosya dökümü ana bağlama girmesin.
- Bir dosyayı bir kez oku, tekrar okuma. Değişiklikleri tam dosya yeniden yazmak
  yerine hedefli düzenleme ile yap.
- Test/build çıktısını tam dökme; başarısız olan kısmı göster.
- Basit işlerde plan modu ve uzun muhakeme gerekmiyor — doğrudan yap.

## Compact talimatları

Özetlerken şunları koru: değiştirilen dosyaların tam listesi, çalıştırılan
komutlar ve sonuçları, henüz uygulanmamış migration'lar, kullanıcının reddettiği
yaklaşımlar.
