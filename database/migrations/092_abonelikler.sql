-- 092_abonelikler.sql
-- Abonelik (paket) altyapısı: iyzico + mağaza (App Store / Google Play) ortak modeli.
--
-- NEDEN AYRI BİR ŞEY: 072'deki ai_credit_orders TEK SEFERLİK kredi yüklemesidir —
-- "şu kadar kredi al, bitince yenisini al". Paketler ise SÜREKLİ bir ilişki:
-- her dönem başında yenilenen kredi + planın açtığı haklar. İkisini tek tabloya
-- sıkıştırmak, "bu satır bir kerelik miydi yoksa her ay tekrar mı edecek" sorusunu
-- her sorguya taşırdı. Kredi siparişleri OLDUĞU GİBİ kalıyor; abonelik onun
-- yerine değil, yanına geliyor (yoğun aylarda ek kredi hâlâ satılıyor).
--
-- ÖDEMENİN KENDİSİ BURADA DEĞİL. Kart bilgisi, yenileme denemesi, başarısız
-- çekim döngüsü sağlayıcıda (iyzico Abonelik API'si / mağaza) yaşar. Bu tablolar
-- yalnızca "kim, hangi plana, hangi döneme kadar hak kazandı" sorusunun cevabını
-- tutar. Sağlayıcı bize webhook ile haber verir, biz durumu buraya yazarız.
--
-- DEĞİŞMEZ KURAL: bu tabloya satır yazmak KREDİ YÜKLEMEZ. Kredi yalnızca
-- subscription_credit_grants üzerinden ve yalnızca bir kez yüklenir.

-- ---------------------------------------------------------------------------
-- Abonelikler
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),

  -- Abonelik kimin: kullanıcının kendisi mi, bir şirket mi.
  -- İkisi de destekleniyor; hangisi olduğu scope ile ayrılır.
  scope varchar(16) not null check (scope in ('user', 'organization')),

  -- FATURA SAHİBİ. scope ne olursa olsun DOLUDUR: ödemeyi yapan, kartı olan,
  -- iptal edebilen kişi. Şirket aboneliğinde bu, aboneliği satın alan yöneticidir.
  -- Aylık krediler de bu kişinin bakiyesine yüklenir (bkz. aşağıdaki not).
  user_id uuid not null references public.users(id) on delete cascade,

  -- scope='organization' ise dolu, değilse boş.
  organization_id uuid references public.organizations(id) on delete cascade,

  -- Plan kataloğu KODDA (billing.plans.ts). Burada yalnızca anahtarı tutuyoruz;
  -- planın içeriği (kredi, özellik) zamanla değişebilir ve eski satırların onu
  -- dondurması istenmiyor — dondurulması gereken tek şey ÖDENEN tutardır.
  plan_key varchar(32) not null,
  period varchar(16) not null check (period in ('monthly', 'yearly')),

  -- pending:   ödeme başlatıldı, sağlayıcıdan onay bekleniyor (HAK VERMEZ).
  -- trialing:  deneme süresi, hak verir.
  -- active:    yürürlükte.
  -- past_due:  çekim başarısız, sağlayıcı yeniden deniyor. Hak SÜRER (dönem
  --            sonuna kadar) — kullanıcıyı bir banka hatası yüzünden anında
  --            kilitlemek, geri kazanılamayan bir müşteri kaybı demektir.
  -- canceled:  iptal edildi; current_period_end'e kadar hak sürer.
  -- expired:   dönem doldu, hak yok.
  status varchar(16) not null default 'pending'
    check (status in ('pending', 'trialing', 'active', 'past_due', 'canceled', 'expired')),

  -- Ödemenin geldiği kanal. Mağaza aboneliklerini iptal/iade eden biz DEĞİLİZ;
  -- kullanıcıyı doğru yere yönlendirebilmek için kaynağı bilmek zorundayız.
  source varchar(16) not null check (source in ('iyzico', 'app_store', 'play_store', 'manual')),

  -- Sağlayıcıdaki karşılığı: iyzico'da subscriptionReferenceCode, App Store'da
  -- originalTransactionId, Play'de purchaseToken. Webhook'un hangi aboneliğe
  -- ait olduğu bununla bulunur.
  provider_ref varchar(200),
  -- iyzico customerReferenceCode / mağaza hesap kimliği. Kart güncelleme ve
  -- ikinci bir abonelik açarken gerekiyor.
  provider_customer_ref varchar(200),

  current_period_start timestamptz,
  current_period_end timestamptz,
  -- Kullanıcı iptal etti ama dönem sonuna kadar kullanmaya devam ediyor.
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,

  -- ÖDENEN tutar donduruluyor: liste fiyatı sonra değişse bile bu aboneliğin
  -- neye bağlandığı belli kalsın. Vitrin fiyatı USD, tahsilat TRY (bkz.
  -- billing_plan_refs) — ikisi de saklanıyor.
  price_amount numeric(12, 2),
  currency varchar(3) not null default 'TRY',
  price_usd numeric(12, 2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- scope ile organization_id birbirini tutmak ZORUNDA: "şirket aboneliği ama
  -- şirketi yok" ya da "bireysel abonelik ama şirkete bağlı" satırları
  -- yetkilendirmede sessiz hatalara yol açardı.
  constraint subscriptions_kapsam_tutarli check (
    (scope = 'organization' and organization_id is not null) or
    (scope = 'user' and organization_id is null)
  ),

  -- Sağlayıcı referansı TEKİL: webhook iki kez gelirse (iyzico 2xx alana kadar
  -- 15 dakikada bir yeniden gönderiyor) ikinci abonelik satırı açılmasın.
  --
  -- KISMİ İNDEKS DEĞİL, GERÇEK KISIT — bilerek. Kayıt `upsert ... on conflict
  -- (source, provider_ref)` ile yazılıyor ve Postgres, ON CONFLICT'i KISMİ bir
  -- indeksten çıkaramaz (predicate verilmeden "matching constraint yok" hatası
  -- verir). Kısıt olarak tanımlamak sorun çıkarmıyor: Postgres'te NULL'lar
  -- birbirinden farklı sayılır, yani referansı henüz oluşmamış satırlar
  -- (provider_ref IS NULL) istendiği kadar çoğalabilir.
  constraint uniq_subscriptions_provider_ref unique (source, provider_ref)
);

-- Bir kullanıcının/şirketin AYNI ANDA yalnızca bir YÜRÜRLÜKTEKİ aboneliği olur.
-- Yoksa iki plandan da kredi yüklenir ve hangi hakların geçerli olduğu belirsizleşir.
--
-- 'canceled' KAPSAM DIŞI, bilerek: iptal eden kişi dönem sonuna kadar
-- kullanmaya devam ediyor ama fikrini değiştirip yeni bir paket alabilmeli.
-- İptal edilmiş satırı da kilitlemek, geri dönmek isteyen müşteriyi dönem
-- bitene kadar bekletmek demekti. 'pending' de dışarıda: yarım kalmış ödeme
-- denemeleri yeni denemeyi engellememeli.
create unique index if not exists uniq_subscriptions_aktif_kullanici
  on public.subscriptions(user_id)
  where scope = 'user' and status in ('trialing', 'active', 'past_due');

create unique index if not exists uniq_subscriptions_aktif_organizasyon
  on public.subscriptions(organization_id)
  where scope = 'organization' and status in ('trialing', 'active', 'past_due');

create index if not exists idx_subscriptions_user on public.subscriptions(user_id, created_at desc);
create index if not exists idx_subscriptions_durum on public.subscriptions(status, current_period_end);

comment on table public.subscriptions is
  'Paket abonelikleri (iyzico + mağaza). Satır açmak kredi YÜKLEMEZ; kredi subscription_credit_grants üzerinden gider (092).';
comment on column public.subscriptions.user_id is
  'Fatura sahibi. Şirket aboneliğinde de dolu: ödemeyi yapan ve iptal edebilen kişi (092).';
comment on column public.subscriptions.status is
  'past_due hak vermeye DEVAM eder: başarısız tek çekim yüzünden erişimi kesmek müşteri kaybıdır (092).';

-- ---------------------------------------------------------------------------
-- Sağlayıcıdan gelen ham olaylar
-- ---------------------------------------------------------------------------
-- NEDEN SAKLIYORUZ: ödeme tarafında "neden bu kullanıcının aboneliği düştü"
-- sorusunun cevabı yalnızca sağlayıcının gönderdiği gövdede olur. Olayı işleyip
-- atmak, o soruyu cevapsız bırakır. Ayrıca yeniden işleme (replay) buradan yapılır.
create table if not exists public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  source varchar(16) not null,
  event_type varchar(80),
  provider_ref varchar(200),

  -- Aynı olayın iki kez işlenmesini VERİTABANI engeller. iyzico 2xx alana kadar
  -- 15 dakikada bir tekrar gönderiyor; uygulama katmanındaki "işledim mi" kontrolü
  -- eşzamanlı iki teslimatta yarışa giriyordu.
  dedupe_key varchar(300) not null,

  payload jsonb not null,
  signature_ok boolean not null default false,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_subscription_events_dedupe
  on public.subscription_events(source, dedupe_key);
create index if not exists idx_subscription_events_zaman
  on public.subscription_events(created_at desc);

comment on table public.subscription_events is
  'Ödeme sağlayıcılarından gelen ham webhook gövdeleri. dedupe_key tekrar teslimatı veritabanı düzeyinde keser (092).';

-- ---------------------------------------------------------------------------
-- Dönemlik kredi yüklemeleri
-- ---------------------------------------------------------------------------
-- ÇİFT YÜKLEMEYE KARŞI ASIL KORUMA BU TABLODUR. 072'de siparişler için
-- ai_credit_transactions.order_id üzerindeki tekil indeks ne yapıyorsa, burada
-- (subscription_id, period_start) çifti onu yapıyor: webhook birden çok kez
-- gelse, yenileme işleyicisi iki kez koşsa bile bir döneme ait kredi BİR KEZ yüklenir.
create table if not exists public.subscription_credit_grants (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  -- Kredinin ait olduğu dönemin başlangıcı. Gün değil AN olarak tutuluyor;
  -- sağlayıcı dönem sınırını saat bazında veriyor.
  period_start timestamptz not null,
  credits numeric(14, 2) not null check (credits > 0),
  -- Kredinin gerçekten bakiyeye geçtiğinin kanıtı: defter satırı.
  transaction_id uuid references public.ai_credit_transactions(id) on delete set null,
  granted_to uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_subscription_grant_donem
  on public.subscription_credit_grants(subscription_id, period_start);

comment on table public.subscription_credit_grants is
  'Dönem başına bir kez yüklenen paket kredisi. (subscription_id, period_start) tekil: tekrar teslimat kredi çoğaltamaz (092).';

-- ---------------------------------------------------------------------------
-- Sağlayıcıdaki plan karşılıkları ve tahsilat tutarları
-- ---------------------------------------------------------------------------
-- NEDEN TABLO (koda gömmek yerine): iyzico'da plan referans kodu, planı iyzico
-- panelinde oluşturunca ÜRETİLİR — kodda önceden bilinemez. Ayrıca tahsilat
-- tutarı iyzico planında SABİTTİR; kur değiştikçe plan yeniden oluşturulur ve
-- yeni kod buraya yazılır. Bunu ortam değişkeninde tutmak her fiyat değişikliğini
-- SSH + yeniden başlatma işine çevirirdi (086 ile aynı gerekçe).
--
-- ÖNEMLİ: buradaki price_amount, iyzico planındaki tutarla AYNI olmak zorundadır.
-- Ayrışırsa kullanıcıya bir tutar gösterip başka bir tutar çekmiş oluruz.
create table if not exists public.billing_plan_refs (
  provider varchar(16) not null,
  plan_key varchar(32) not null,
  period varchar(16) not null check (period in ('monthly', 'yearly')),

  -- iyzico'da pricingPlanReferenceCode; mağazalarda ürün kimliği
  -- (ör. app.projelio.pro.monthly).
  reference_code varchar(200),

  -- Sağlayıcıda tanımlı GERÇEK tahsilat tutarı ve para birimi.
  price_amount numeric(12, 2),
  currency varchar(3) not null default 'TRY',

  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null,
  primary key (provider, plan_key, period)
);

comment on table public.billing_plan_refs is
  'Plan anahtarı -> sağlayıcıdaki plan kodu ve tahsilat tutarı. Vitrin fiyatı USD koddadır; buradaki tutar sağlayıcıdaki planla birebir aynı olmalı (092).';

-- Serbest biçimli ayarlar (ör. vitrin çevirisinde kullanılan USD/TRY kuru).
create table if not exists public.billing_config (
  key varchar(64) primary key,
  value text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

comment on table public.billing_config is
  'Fatura tarafı serbest ayarlar (ör. usd_try_rate: vitrinde $ tutarını ₺ göstermek için) (092).';

-- Satır güvenliği: bu tablolara yalnızca backend (service_role) dokunuyor.
-- Diğer tablolarla aynı çizgi (bkz. 072).
alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;
alter table public.subscription_credit_grants enable row level security;
alter table public.billing_plan_refs enable row level security;
alter table public.billing_config enable row level security;
