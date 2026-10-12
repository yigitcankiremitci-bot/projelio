-- 163_baglanti_listeleri.sql
-- Bağlantı listeleri: Bağlantı ve İlişkiler'deki kartları gruplamak
-- (oynatma listesi mantığı — bir kart birden çok listede olabilir).
--
-- NEDEN: Fuarda toplanan bağlantılar listede dururken ekipten biri Excel ile
-- başka bir bağlantı listesi yükleyecekti; ikisi tek listede birbirine
-- karışıyordu (kullanıcı isteği, 2026-10-12). Liste bir ETİKET: kartı
-- taşımaz, kopyalamaz; liste silinince kartlar yerinde kalır.
--
-- Kapsam kartlarla aynı: şirket ya da iş (serbest çalışan). Ad kapsamda
-- tekil (büyük/küçük harf duyarsız) — iki "İTS 2026" sekmesi kafa karıştırır.

create table if not exists public.baglanti_listeleri (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_id          uuid references public.jobs(id) on delete cascade,
  ad              varchar(80) not null,
  olusturan       uuid references public.users(id) on delete set null,
  created_at      timestamp not null default current_timestamp,
  updated_at      timestamp not null default current_timestamp,
  constraint baglanti_listeleri_kapsam_chk check (num_nonnulls(organization_id, job_id) = 1),
  constraint baglanti_listeleri_ad_chk check (length(trim(ad)) > 0)
);

create unique index if not exists baglanti_listeleri_ad_uniq
  on public.baglanti_listeleri (coalesce(organization_id, job_id), lower(trim(ad)));

create table if not exists public.baglanti_liste_uyeleri (
  liste_id   uuid not null references public.baglanti_listeleri(id) on delete cascade,
  party_id   uuid not null references public.party(id) on delete cascade,
  ekleyen    uuid references public.users(id) on delete set null,
  created_at timestamp not null default current_timestamp,
  primary key (liste_id, party_id)
);

create index if not exists baglanti_liste_uyeleri_party_idx on public.baglanti_liste_uyeleri (party_id);

comment on table public.baglanti_listeleri is
  'Baglanti ve Iliskiler kartlarinin listeleri (oynatma listesi gibi; kart birden cok listede olabilir). Liste silinince kartlar silinmez.';

alter table public.baglanti_listeleri enable row level security;
alter table public.baglanti_liste_uyeleri enable row level security;
