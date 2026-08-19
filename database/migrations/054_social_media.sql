-- 054_social_media.sql
-- Sosyal Medya modülü (pd_sosyal_medya) — kendi veri modeli
--
-- NEDEN AYRI TABLO
-- ---------------
-- Bu modül bugüne kadar module_records üzerinde "başlık + tarih + durum" olan
-- bir kayıt defteriydi. Sosyal medya yöneticisinin günlük işi bu değil:
--   · birden çok hesabı (Instagram, LinkedIn, TikTok…) ayrı ayrı yönetiyor,
--   · aynı içeriği birden çok hesapta, kanala göre değişen metinle yayımlıyor,
--   · içeriğe görsel/video iliştiriyor,
--   · yayın gününü takvimde görmek istiyor.
-- Bunların hiçbiri tek bir jsonb sütununa sığmıyor: "gönderi ↔ hesap" çoğa çok
-- bir ilişki, "gönderi ↔ dosya" sıralı bir liste. jsonb içinde tutulsalardı
-- ne sorgulanabilir ne de referans bütünlüğü kurulabilir olurlardı.
--
-- ÜÇ TABLO
-- --------
--   social_accounts      "hangi hesaplar" — profil, kitle, sorumlu, bağlantı
--   social_posts         "ne yayımlanacak" — başlık, metin, medya, plan, durum
--   social_post_targets  "nerede yayımlanacak" — gönderi × hesap, kanala özel
--                        metin ve kanal bazında yayın sonucu
--   social_post_media    "hangi dosyalar" — files tablosuna sıralı referans
--
-- API İLE OTOMATİK PAYLAŞIM
-- -------------------------
-- Henüz yok, ama şema onu bekleyerek yazıldı: hesapta bağlantı durumu ve
-- jeton alanları, hedefte kanal bazında yayın sonucu (dış id, dış adres, hata)
-- şimdiden var. Entegrasyon geldiğinde tek yapılacak iş bir yayın işçisinin
-- `social_post_targets` satırlarını işleyip bu alanları doldurması olacak —
-- şema göçü gerekmeyecek.
--
-- JETON UYARISI: access_token_ref bir jeton DEĞİL, jetonun sır saklayıcıdaki
-- anahtarıdır. Sosyal medya jetonları bu tabloya düz metin yazılmamalıdır;
-- google_accounts/microsoft_accounts deseninde ayrı ve şifreli saklanır.
--
-- GÜVENLİK NOTU: diğer modül tablolarıyla aynı model — RLS açık, politika yok.
-- Erişim yalnızca service_role üzerinden, yani yalnızca SocialMediaService'ten
-- geçer; yetki kontrolü (organizasyon sahibi > departman yöneticisi > modül
-- üyesi) tamamen servis katmanının sorumluluğudur.

-- ---------------------------------------------------------------------------
-- 1) Hesaplar
-- ---------------------------------------------------------------------------
-- Sahiplik module_records ile aynı ikili desen: kayıt ya bir ORGANİZASYONA
-- (şirket departmanı) ya bir İŞE (serbest çalışan) bağlanır — bkz.
-- 037_freelancer_modules.sql.

create table if not exists public.social_accounts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null,

  platform           varchar not null
                       check (platform in ('instagram','facebook','x','linkedin','tiktok',
                                           'youtube','pinterest','threads','blog','other')),
  handle             varchar not null,            -- @kullaniciadi
  display_name       varchar,                     -- ekranda görünen ad
  profile_url        text,
  avatar_url         text,

  -- Yöneticinin hesabı tanıması için: kitle, ton, yayın ritmi.
  follower_count     integer,
  audience_note      text,
  tone_note          text,
  posting_frequency  varchar,                     -- "haftada 3", "her gün 19:00"
  color              varchar(9),                  -- takvimde hesabın rengi

  owner_user_id      uuid references public.users(id) on delete set null,

  -- Otomatik paylaşım zemini. Bugün her hesap 'manual': yayın kullanıcının
  -- kendisi tarafından yapılır, Projelio yalnızca planı ve metni tutar.
  connection_status  varchar not null default 'manual'
                       check (connection_status in ('manual','connected','expired','revoked')),
  external_account_id varchar,                    -- platformdaki hesap kimliği
  access_token_ref   varchar,                     -- sır saklayıcıdaki anahtar (jetonun kendisi DEĞİL)
  token_expires_at   timestamp,
  scopes             text[],
  last_synced_at     timestamp,

  data               jsonb not null default '{}'::jsonb,
  active             boolean not null default true,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp,
  archived_at        timestamp,

  constraint social_accounts_scope check (num_nonnulls(organization_id, job_id) = 1)
);

comment on table public.social_accounts is
  'Sosyal Medya modulunun yonettigi hesaplar. Sahiplik ya organizasyon ya is (tam olarak biri).';
comment on column public.social_accounts.access_token_ref is
  'Sir saklayicidaki anahtar. Erisim jetonunun KENDISI bu tabloya yazilmaz.';

create index if not exists social_accounts_org_idx
  on public.social_accounts(organization_id) where organization_id is not null and archived_at is null;
create index if not exists social_accounts_job_idx
  on public.social_accounts(job_id) where job_id is not null and archived_at is null;

alter table public.social_accounts enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Gönderiler
-- ---------------------------------------------------------------------------
-- Bir gönderi = bir içerik fikri. Hangi hesaplarda yayımlanacağı ayrı tabloda
-- (social_post_targets): aynı kampanya metni üç kanala gidiyorsa üç ayrı kayıt
-- girilmesi gerekmesin.

create table if not exists public.social_posts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null,

  -- İçerik
  title              varchar not null,            -- iç başlık: takvimde görünen kısa ad
  caption            text,                        -- yayımlanacak açıklama metni
  hashtags           text,                        -- "#kahve #istanbul" — serbest metin
  link_url           text,                        -- gönderideki bağlantı / CTA
  first_comment      text,                        -- ilk yorum (Instagram'da etiket taşımak için yaygın)
  content_type       varchar not null default 'image'
                       check (content_type in ('image','video','carousel','story','reel',
                                               'text','article','poll','other')),
  campaign           varchar,                     -- kampanya etiketi

  -- Plan ve akış
  status             varchar not null default 'draft'
                       check (status in ('idea','draft','ready','approved','scheduled',
                                         'published','failed','cancelled')),
  scheduled_at       timestamp,                   -- planlanan yayın anı
  published_at       timestamp,
  assignee_id        uuid references public.users(id) on delete set null,
  approved_by        uuid references public.users(id) on delete set null,
  approved_at        timestamp,
  task_id            uuid references public.tasks(id) on delete set null,

  -- Yayın sonrası ölçüm (gönderi geneli; kanal bazlı olan hedefte durur)
  reach              integer,
  engagement         integer,
  clicks             integer,
  result_note        text,

  data               jsonb not null default '{}'::jsonb,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp,
  archived_at        timestamp,

  constraint social_posts_scope check (num_nonnulls(organization_id, job_id) = 1)
);

comment on table public.social_posts is
  'Sosyal medya icerigi. Hangi hesaplarda yayimlanacagi social_post_targets tablosundadir.';
comment on column public.social_posts.title is
  'Ic baslik: takvimde ve listede gorunur, yayimlanan metin degildir (o caption).';

-- Takvim sorgusu: sahip + tarih aralığı. Ayın gönderilerini tek indeksle çeker.
create index if not exists social_posts_org_calendar_idx
  on public.social_posts(organization_id, scheduled_at)
  where organization_id is not null and archived_at is null;
create index if not exists social_posts_job_calendar_idx
  on public.social_posts(job_id, scheduled_at)
  where job_id is not null and archived_at is null;

alter table public.social_posts enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Gönderi × hesap
-- ---------------------------------------------------------------------------
-- Kanala özel metin burada: LinkedIn'de uzun, X'te kısa aynı içerik. Boşsa
-- gönderinin ortak metni kullanılır.
--
-- Yayın sonucu da kanal bazında tutulur: üç hesaptan biri hata verdiğinde
-- gönderinin tamamı "başarısız" sayılmamalı, hangi kanalın düştüğü görülmeli.

create table if not exists public.social_post_targets (
  id                 uuid primary key default gen_random_uuid(),
  post_id            uuid not null references public.social_posts(id) on delete cascade,
  account_id         uuid not null references public.social_accounts(id) on delete cascade,

  caption_override   text,
  status             varchar not null default 'pending'
                       check (status in ('pending','scheduled','published','failed','skipped')),

  -- Otomatik paylaşım geldiğinde işçi bunları doldurur.
  external_post_id   varchar,
  external_url       text,
  error_message      text,
  published_at       timestamp,
  attempted_at       timestamp,

  created_at         timestamp not null default current_timestamp,

  unique (post_id, account_id)
);

comment on table public.social_post_targets is
  'Bir icerigin hangi hesapta yayimlanacagi + kanala ozel metin + kanal bazinda yayin sonucu.';

create index if not exists social_post_targets_post_idx on public.social_post_targets(post_id);
create index if not exists social_post_targets_account_idx on public.social_post_targets(account_id);

alter table public.social_post_targets enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Gönderi medyası
-- ---------------------------------------------------------------------------
-- Dosya Projelio'nun mevcut dosya altyapısında (Drive/OneDrive) durur; burada
-- yalnızca hangi dosyanın hangi sırayla iliştirildiği tutulur. Böylece görsel
-- ikinci bir yere kopyalanmaz ve dosya ekranındaki izin/paylaşım düzeni aynen
-- geçerli kalır.

create table if not exists public.social_post_media (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.social_posts(id) on delete cascade,
  file_id       uuid not null references public.files(id) on delete cascade,
  sort_order    integer not null default 0,
  alt_text      text,                              -- erişilebilirlik metni
  created_at    timestamp not null default current_timestamp,

  unique (post_id, file_id)
);

comment on table public.social_post_media is
  'Gonderiye iliştirilen gorsel/video. Icerik files tablosunda (Drive/OneDrive), burada yalnizca referans ve sira.';

create index if not exists social_post_media_post_idx on public.social_post_media(post_id, sort_order);

alter table public.social_post_media enable row level security;
