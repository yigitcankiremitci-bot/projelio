-- 175_studyo_oda_duzenleri.sql
-- 3D ofiste serbest çalışanın "Stüdyom"u için oda düzenleri
--
-- NE İÇİN
-- -------
-- Anasayfadaki 3D ofisin şirket hâli 171'deki ofis_oda_duzenleri'ni kullanıyor
-- (şirket başına, organization_id). Stüdyom'da odalar departman değil serbest
-- İŞLER (apps/web/src/lib/studyoOfisi.ts); bunların bir şirketi yok. Düzen yine
-- odanın köşesine göre aynı biçimde tutulur (packages/shared/src/ofisDuzeni.ts).
--
-- İKİ TÜR SATIR
-- -------------
--   • İş odası (job_id dolu, oda_id = iş kimliği): işin ekibinde ORTAK — işe
--     davetli herkes kendi stüdyosunda aynı odayı görür. Yalnızca işin sahibi
--     değiştirir (departman odasını yöneticisinin değiştirmesi gibi).
--   • Stüdyonun kendi alanları (user_id dolu, oda_id "ortak" / "toplanti"):
--     KİŞİNİN. Her kullanıcının stüdyosu ayrı; ortak alanını o düzenler.
-- Tam olarak biri dolu (CHECK). İş ya da kullanıcı silinince satırı da gider.
--
-- anahtar: upsert'in tek çakışma noktası ("is:<iş>" / "kullanici:<kullanıcı>:<oda>").
-- İki ayrı kısmi tekil indeks PostgREST'in onConflict'iyle kullanılamıyordu.

create table if not exists public.studyo_oda_duzenleri (
  anahtar     varchar(100) primary key,
  job_id      uuid references public.jobs(id) on delete cascade,
  user_id     uuid references public.users(id) on delete cascade,
  oda_id      varchar(40) not null,
  duzen       jsonb not null default '{"nesneler": {}}'::jsonb,
  updated_by  uuid references public.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  constraint studyo_oda_duzenleri_tek_sahip check (num_nonnulls(job_id, user_id) = 1)
);

create index if not exists studyo_oda_duzenleri_job_idx on public.studyo_oda_duzenleri (job_id) where job_id is not null;
create index if not exists studyo_oda_duzenleri_user_idx on public.studyo_oda_duzenleri (user_id) where user_id is not null;

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı.
alter table public.studyo_oda_duzenleri enable row level security;

comment on table public.studyo_oda_duzenleri is
  '3D ofis Studyom oda duzeni: is odasi (job_id, ekipte ortak) ya da kisinin ortak/toplanti alani (user_id). Bicim: shared ofisDuzeni.ts.';
