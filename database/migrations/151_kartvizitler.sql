-- 151_kartvizitler.sql
-- Dijital kartvizit: her kullanıcı ücretsiz olarak <adres>.projelio.app
-- adresinde açılan bir kartvizit sayfası ve onu açan logolu QR kodu
-- oluşturabilir (bkz. backend modules/kartvizit, packages/shared kartvizit.ts).
--
-- Kullanıcı başına EN FAZLA BİR kart: user_id birincil anahtar. Kartın
-- fotoğrafı ayrı saklanmaz, Projelio profil fotoğrafıdır (users.avatar_url);
-- profilde değişince kartta da değişir.
--
-- ADRES: tekil, küçük harf (sunucu küçültüp yazar; düz sütunda tekil indeks —
-- ifade indeksi PostgREST'in upsert'üyle kullanılamıyor). Biçim kuralı burada
-- da var ki servis atlansa bile DNS'te geçersiz bir ad yazılamasın; ayrılmış
-- adlar (app, api, ...) yalnızca serviste denetleniyor, liste kodla birlikte
-- değişiyor.
--
-- Adres değişebilir. Değişince eski adres boşa çıkar ve basılmış QR'lar artık
-- açılmaz — arayüz bunu kaydetmeden önce söylüyor.
--
-- Caddy, joker sertifika yerine adres ilk açıldığında sertifika alıyor
-- (on_demand_tls). Sertifika istemeden önce "bu adres gerçekten var mı" diye
-- backend'e soruyor; cevap bu tablodan, yalnızca aktif kartlar için evet.
--
-- GÜVENLİK: diğer servis tablolarıyla aynı model — RLS açık, politika yok,
-- erişim yalnızca backend'in servis anahtarıyla.

create table if not exists public.kartvizitler (
  user_id      uuid primary key references public.users(id) on delete cascade,
  adres        varchar(30) not null,
  full_name    varchar(80) not null,
  title        varchar(80),
  title_en     varchar(80),
  phone        varchar(24),
  email        varchar(120),
  website      varchar(200),
  location     varchar(60),
  tagline      varchar(120),
  tagline_en   varchar(120),
  sosyal       jsonb not null default '{}'::jsonb,
  show_photo   boolean not null default true,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint kartvizitler_adres_bicim check (
    adres ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$' and position('--' in adres) = 0
  ),
  constraint kartvizitler_ad_bos_degil check (length(btrim(full_name)) > 0),
  constraint kartvizitler_sosyal_nesne check (jsonb_typeof(sosyal) = 'object')
);

comment on table public.kartvizitler is
  'Kullanıcının <adres>.projelio.app dijital kartviziti. Kullanıcı başına bir kart; fotoğraf users.avatar_url.';

create unique index if not exists kartvizitler_adres_uniq
  on public.kartvizitler (adres);

alter table public.kartvizitler enable row level security;
