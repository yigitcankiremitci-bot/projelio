-- 145_icerik_analizi.sql
-- Sosyal Medya: içerik analizi (Instagram Insights) + ilham panosu + Lio fikir raporları
--
-- Kullanıcı kendi içeriklerinin "neden ne kadar izlendiğini" görmek ve yeni
-- fikir üretmek istiyor. Üç parça:
--
--   social_account_media   bağlı Instagram hesabının platformdaki gönderileri
--                          ve metrikleri (izlenme, erişim, kaydetme, paylaşım,
--                          izlenme süresi). Gece senkronuyla dolar.
--   social_inspirations    kullanıcının ELLE eklediği ilham kaynakları: başka
--                          hesapların bağlantısı, notu, isteğe bağlı bir
--                          referans videosu. Otomatik veri toplama YOK — bkz.
--                          aşağıdaki "neden elle".
--   social_idea_reports    Lio'nun ürettiği fikir raporları. Saklanıyor, çünkü
--                          her biri Lio Bakiyesi harcıyor: sayfayı yenileyen
--                          kullanıcı aynı raporu ikinci kez ödememeli.
--
-- ---------------------------------------------------------------------------
-- NEDEN İLHAM KAYNAKLARI ELLE
-- ---------------------------------------------------------------------------
-- Başka hesapların verisini otomatik çekmenin resmi yolu (Business Discovery,
-- Hashtag Search) yalnızca "Instagram API with Facebook Login" yolunda var ve
-- Facebook Sayfası istiyor. Projelio bilerek Instagram Login yolunu seçti
-- (bkz. docs/moduller/14-instagram-entegrasyonu.md §1). Kazıma (scraping) ise
-- Instagram'ın koşullarına aykırı ve kullanıcının hesabını riske atar. Bu
-- yüzden ilham panosu kullanıcının kendi notları + kendi yüklediği referans
-- dosyası üzerinde çalışır.
--
-- GÜVENLİK NOTU: diğer sosyal medya tablolarıyla aynı model — RLS açık,
-- politika yok, erişim yalnızca service_role ile servis katmanından.
--
-- Migration uygulanmadan önce kod bu tablolara dokunan uçlarda anlaşılır bir
-- hata döner; yayın ve takvim akışı etkilenmez.

-- ---------------------------------------------------------------------------
-- 1) Hesabın platformdaki gönderileri + metrikleri
-- ---------------------------------------------------------------------------

create table if not exists public.social_account_media (
  id                     uuid primary key default gen_random_uuid(),
  account_id             uuid not null references public.social_accounts(id) on delete cascade,
  -- Instagram medya kimliği. Hesap + kimlik tekil: senkron upsert eder.
  external_media_id      varchar not null,
  -- Gönderi Projelio'dan yayımlandıysa ilgili içerik (social_post_targets.
  -- external_post_id eşleşmesiyle bulunur). Elle Instagram'dan atılanlarda boş.
  post_id                uuid references public.social_posts(id) on delete set null,

  media_type             varchar,          -- IMAGE | VIDEO | CAROUSEL_ALBUM
  media_product_type     varchar,          -- FEED | REELS | STORY | AD
  caption                text,
  permalink              text,
  -- Instagram CDN adresleri birkaç gün içinde geçersizleşiyor; her senkronda
  -- tazelenir. Kalıcı arşiv değil, yalnızca önizleme.
  thumbnail_url          text,
  posted_at              timestamp,

  like_count             integer,
  comments_count         integer,
  reach                  integer,
  views                  integer,
  saved                  integer,
  shares                 integer,
  total_interactions     integer,
  -- Yalnızca reels: milisaniye.
  avg_watch_time_ms      integer,
  total_watch_time_ms    bigint,

  metrics_synced_at      timestamp,
  -- Bu gönderinin metrikleri okunamadıysa neden (ör. hesap profesyonele
  -- geçmeden önce atılmış gönderi). Diğer gönderilerin senkronunu durdurmaz.
  metrics_error          text,

  -- Lio'nun "neden böyle gitti" analizi. Saklanır: bakiye harcıyor.
  lio_analiz             jsonb,
  lio_analiz_at          timestamp,

  created_at             timestamp not null default (now() at time zone 'utc'),
  updated_at             timestamp not null default (now() at time zone 'utc'),

  unique (account_id, external_media_id)
);

create index if not exists social_account_media_account_posted_idx
  on public.social_account_media (account_id, posted_at desc);

alter table public.social_account_media enable row level security;

comment on table public.social_account_media is
  'Bagli Instagram hesabinin platformdaki gonderileri ve metrikleri (Insights). Gece senkronuyla dolar.';

-- Hesap düzeyinde senkron durumu. Yayın bağlantısının sağlığından (connection_*)
-- AYRI: metrikler okunamıyor diye yayın kanalı "kopuk" görünmemeli.
alter table public.social_accounts
  add column if not exists insights_synced_at timestamp,
  add column if not exists insights_error text;

-- ---------------------------------------------------------------------------
-- 2) İlham panosu
-- ---------------------------------------------------------------------------
-- Sahiplik diğer sosyal tablolarla aynı ikili desen: organizasyon (+departman)
-- ya da iş.

create table if not exists public.social_inspirations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null,

  -- account: takip edilen bir hesap; post: tek bir içerik (video/gönderi)
  kind               varchar not null default 'post' check (kind in ('account', 'post')),
  platform           varchar not null default 'instagram',
  url                text,
  handle             varchar,
  title              varchar not null,
  -- Kullanıcının gözlemi: "ilk 2 saniyede soruyla açıyor", "1,2 M izlenme".
  note               text,
  -- Virgülle ayrılmış serbest etiketler: "hook, eğitici, kısa".
  tags               text,
  -- İsteğe bağlı referans dosyası (kullanıcının yüklediği video/görsel).
  file_id            uuid references public.files(id) on delete set null,

  lio_analiz         jsonb,
  lio_analiz_at      timestamp,

  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default (now() at time zone 'utc'),
  updated_at         timestamp not null default (now() at time zone 'utc'),

  constraint social_inspirations_owner check (num_nonnulls(organization_id, job_id) = 1)
);

create index if not exists social_inspirations_org_idx on public.social_inspirations (organization_id);
create index if not exists social_inspirations_job_idx on public.social_inspirations (job_id);

alter table public.social_inspirations enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Lio fikir raporları
-- ---------------------------------------------------------------------------

create table if not exists public.social_idea_reports (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null,
  -- Rapor tek bir hesabın verisine dayanıyorsa o hesap; boşsa kapsamdaki tüm
  -- bağlı hesaplar.
  account_id         uuid references public.social_accounts(id) on delete set null,
  -- Kullanıcının isteği ("bu ay eğitici içerik ağırlıklı") — rapor neye cevap.
  istek              text,
  -- { ozet, kaliplar: [...], fikirler: [...] } — bkz. packages/shared SocialIdeaReport.
  icerik             jsonb not null,
  -- Harcanan Lio Bakiyesi (birim).
  kredi              integer not null default 0,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default (now() at time zone 'utc'),

  constraint social_idea_reports_owner check (num_nonnulls(organization_id, job_id) = 1)
);

create index if not exists social_idea_reports_org_idx on public.social_idea_reports (organization_id, created_at desc);
create index if not exists social_idea_reports_job_idx on public.social_idea_reports (job_id, created_at desc);

alter table public.social_idea_reports enable row level security;
