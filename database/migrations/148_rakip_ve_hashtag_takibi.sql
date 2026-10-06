-- 148_rakip_ve_hashtag_takibi.sql
-- Sosyal Medya > Analiz > Rakipler: Facebook Login bağlantısı, rakip hesap
-- takibi (Business Discovery) ve hashtag takibi.
--
-- NEDEN İKİNCİ BİR BAĞLANTI: Projelio'nun Instagram bağlantısı "Instagram
-- Login" yolunda (Sayfa istemiyor, bkz. 14-instagram-entegrasyonu.md §1).
-- Başka hesapların herkese açık verisi (Business Discovery) ve hashtag araması
-- YALNIZCA "Facebook Login" yolunda var ve Instagram hesabının bir Facebook
-- Sayfasına bağlı olmasını istiyor. Bu bağlantı isteğe bağlı ve yalnızca OKUR;
-- yayın akışı mevcut bağlantıdan yürümeye devam eder.
--
-- NE ALINIR / ALINMAZ: Business Discovery yalnızca İŞLETME ve İÇERİK
-- ÜRETİCİSİ hesaplarında çalışır; takipçi, gönderi sayısı ve gönderilerin
-- beğeni/yorum sayısını verir. İzlenme/erişim/kaydetme yalnızca hesap
-- sahibine açık — rakip için yok.
--
-- GÜVENLİK NOTU: diğer sosyal medya tablolarıyla aynı model — RLS açık,
-- politika yok, erişim yalnızca servis katmanından. Jeton şifreli
-- (SOCIAL_TOKEN_ENC_KEY) ve yalnızca RakipTakibiService okur.

-- ---------------------------------------------------------------------------
-- 1) Facebook Login bağlantısı
-- ---------------------------------------------------------------------------

create table if not exists public.social_fb_connections (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null,

  -- Sorguların "kimin adına" yapıldığı Instagram hesabı (Sayfaya bağlı olan).
  ig_user_id         varchar not null,
  ig_username        varchar,
  page_id            varchar,
  page_name          varchar,

  -- SAYFA erişim jetonu: uzun ömürlü kullanıcı jetonundan türetilen Sayfa
  -- jetonunun süresi dolmuyor; kullanıcı jetonu (60 gün) saklanmıyor.
  token_enc          text not null,
  scopes             text[],

  -- Meta'nın son yanıtındaki çağrı kullanım başlıkları (x-app-usage,
  -- x-business-use-case-usage) — panelde "sınır" göstergesi.
  kullanim           jsonb,
  kullanim_at        timestamp,
  hata               text,

  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default (now() at time zone 'utc'),
  updated_at         timestamp not null default (now() at time zone 'utc'),

  constraint social_fb_connections_owner check (num_nonnulls(organization_id, job_id) = 1)
);

create index if not exists social_fb_connections_org_idx on public.social_fb_connections (organization_id);
create index if not exists social_fb_connections_job_idx on public.social_fb_connections (job_id);

alter table public.social_fb_connections enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Rakip takibi — ilham panosundaki "hesap" kayıtları üzerinden
-- ---------------------------------------------------------------------------
-- Ayrı bir "rakipler" listesi kurulmadı: kullanıcı beğendiği hesapları zaten
-- ilham panosuna ekliyor (elle ya da "Benzer hesap bul"dan). Takip o kaydın
-- bir özelliği.

alter table public.social_inspirations
  add column if not exists rakip_takip boolean not null default false,
  add column if not exists rakip_profil jsonb,
  add column if not exists rakip_synced_at timestamp,
  add column if not exists rakip_hata text;

create table if not exists public.social_competitor_snapshots (
  inspiration_id     uuid not null references public.social_inspirations(id) on delete cascade,
  captured_on        date not null,
  followers_count    integer,
  media_count        integer,
  primary key (inspiration_id, captured_on)
);

alter table public.social_competitor_snapshots enable row level security;

create table if not exists public.social_competitor_media (
  id                 uuid primary key default gen_random_uuid(),
  inspiration_id     uuid not null references public.social_inspirations(id) on delete cascade,
  external_media_id  varchar not null,
  caption            text,
  media_type         varchar,
  media_product_type varchar,
  permalink          text,
  posted_at          timestamp,
  like_count         integer,
  comments_count     integer,
  updated_at         timestamp not null default (now() at time zone 'utc'),
  unique (inspiration_id, external_media_id)
);

create index if not exists social_competitor_media_idx
  on public.social_competitor_media (inspiration_id, posted_at desc);

alter table public.social_competitor_media enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Hashtag takibi
-- ---------------------------------------------------------------------------
-- Meta kuralı: bir Instagram hesabı 7 gün içinde en fazla 30 FARKLI hashtag
-- sorgulayabilir. Aynı etiketi tekrar sorgulamak yeni hak harcamaz. Kullanım
-- `son_sorgu`'dan hesaplanır (son 7 günde sorgulanan farklı etiket sayısı).

create table if not exists public.social_hashtag_takipleri (
  id                 uuid primary key default gen_random_uuid(),
  connection_id      uuid not null references public.social_fb_connections(id) on delete cascade,
  hashtag            varchar not null,
  ig_hashtag_id      varchar,
  aktif              boolean not null default true,
  ilk_sorgu          timestamp,
  son_sorgu          timestamp,
  hata               text,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default (now() at time zone 'utc'),
  unique (connection_id, hashtag)
);

alter table public.social_hashtag_takipleri enable row level security;

create table if not exists public.social_hashtag_media (
  id                 uuid primary key default gen_random_uuid(),
  takip_id           uuid not null references public.social_hashtag_takipleri(id) on delete cascade,
  external_media_id  varchar not null,
  -- top: etiketin en popülerleri · recent: son 24 saat
  tur                varchar not null check (tur in ('top', 'recent')),
  caption            text,
  media_type         varchar,
  permalink          text,
  posted_at          timestamp,
  like_count         integer,
  comments_count     integer,
  captured_at        timestamp not null default (now() at time zone 'utc'),
  unique (takip_id, external_media_id)
);

create index if not exists social_hashtag_media_idx on public.social_hashtag_media (takip_id, captured_at desc);

alter table public.social_hashtag_media enable row level security;
