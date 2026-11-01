-- 177_ajan.sql
-- Ajan MVP: kullanıcının kendi bilgisayarında (Ollama) çalışan, öğrettiklerini
-- belleğinde tutan, araştırıp rapor yazan ve boşta kalınca kendi öğrenme
-- listesinden öğrenmeye devam eden yardımcı.
--
-- NEREDE ÇALIŞIYOR
-- ----------------
-- Model ve ajan programı kullanıcının Mac'inde (repoda `ajan/`). Sunucu modele
-- HİÇ bağlanmaz: Mac'teki program kişiye özel bir anahtarla buradaki işleri
-- alır, sonucu geri yazar. Mac'e dışarıdan bağlantı açılmaz. Bu tablolar
-- yalnızca kuyruk + bellek; Lio'nun kredi sistemine ve araçlarına dokunmaz.
--
-- Şimdilik yalnızca `AJAN_EPOSTALARI` listesindeki hesaplara açık (ajan.service.ts).
--
-- TABLOLAR
-- --------
--   ajan_ayarlari  kişi başına tek satır: Mac anahtarının ÖZETİ (sha256, düz
--                  hâli hiç saklanmaz), son nabız, şu an ne yaptığı, ad.
--   ajan_bilgileri bellek: kullanıcının öğrettikleri (ogretilen) ve ajanın
--                  araştırıp çıkardıkları (ogrenilen).
--   ajan_konulari  öğrenme listesi; ajan da ekler, kullanıcı da.
--   ajan_isleri    kuyruk: sohbet yanıtı, araştırma, öğrenme, liste hazırlama.
--   ajan_mesajlari sohbet geçmişi.
--   ajan_raporlari bitmiş araştırmalar.
--   ajan_onerileri ajanın yapmak istediği, kullanıcı onayı bekleyen işler
--                  (ör. yapılacak eklemek). Ajan Projelio'ya kendisi YAZMAZ.
--
-- Hepsi kullanıcı silinince gider. Erişim yalnızca sunucu (service role).

create table if not exists public.ajan_ayarlari (
  user_id            uuid primary key references public.users(id) on delete cascade,
  ad                 varchar(40) not null default 'Ajan',
  isci_anahtar_ozeti varchar(64),
  anahtar_tarihi     timestamptz,
  son_nabiz          timestamptz,
  isci_durumu        varchar(20) not null default 'bosta',
  isci_notu          varchar(200),
  model              varchar(80),
  ogrenme_acik       boolean not null default true,
  updated_at         timestamptz not null default now()
);

create unique index if not exists ajan_ayarlari_anahtar_idx
  on public.ajan_ayarlari (isci_anahtar_ozeti) where isci_anahtar_ozeti is not null;

create table if not exists public.ajan_bilgileri (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  tur        varchar(12) not null check (tur in ('ogretilen', 'ogrenilen')),
  baslik     varchar(200) not null,
  icerik     text not null,
  kaynaklar  jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ajan_bilgileri_user_idx on public.ajan_bilgileri (user_id, created_at desc);

create table if not exists public.ajan_konulari (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  konu       varchar(200) not null,
  neden      varchar(500),
  oneren     varchar(12) not null default 'kullanici' check (oneren in ('kullanici', 'ajan')),
  durum      varchar(12) not null default 'bekliyor' check (durum in ('bekliyor', 'ogreniliyor', 'ogrenildi', 'atlandi')),
  oncelik    smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ajan_konulari_user_idx on public.ajan_konulari (user_id, durum, oncelik desc, created_at);

create table if not exists public.ajan_isleri (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  tur        varchar(12) not null check (tur in ('sohbet', 'arastirma', 'ogrenme', 'liste')),
  girdi      text not null,
  konu_id    uuid references public.ajan_konulari(id) on delete set null,
  durum      varchar(12) not null default 'bekliyor' check (durum in ('bekliyor', 'calisiyor', 'bitti', 'hata')),
  hata       varchar(500),
  alindi_at  timestamptz,
  bitti_at   timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ajan_isleri_kuyruk_idx on public.ajan_isleri (user_id, durum, created_at);

create table if not exists public.ajan_mesajlari (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  rol        varchar(10) not null check (rol in ('kullanici', 'ajan')),
  metin      text not null,
  is_id      uuid references public.ajan_isleri(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ajan_mesajlari_user_idx on public.ajan_mesajlari (user_id, created_at desc);

create table if not exists public.ajan_raporlari (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  is_id      uuid references public.ajan_isleri(id) on delete set null,
  baslik     varchar(200) not null,
  ozet       text,
  icerik     text not null,
  kaynaklar  jsonb not null default '[]'::jsonb,
  okundu     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists ajan_raporlari_user_idx on public.ajan_raporlari (user_id, created_at desc);

create table if not exists public.ajan_onerileri (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  is_id      uuid references public.ajan_isleri(id) on delete set null,
  tur        varchar(20) not null check (tur in ('yapilacak')),
  veri       jsonb not null,
  durum      varchar(12) not null default 'bekliyor' check (durum in ('bekliyor', 'onaylandi', 'reddedildi')),
  created_at timestamptz not null default now()
);

create index if not exists ajan_onerileri_user_idx on public.ajan_onerileri (user_id, durum, created_at desc);

alter table public.ajan_ayarlari  enable row level security;
alter table public.ajan_bilgileri enable row level security;
alter table public.ajan_konulari  enable row level security;
alter table public.ajan_isleri    enable row level security;
alter table public.ajan_mesajlari enable row level security;
alter table public.ajan_raporlari enable row level security;
alter table public.ajan_onerileri enable row level security;

comment on table public.ajan_ayarlari is 'Ajan MVP: kisinin Mac''inde calisan ajanin ayari + nabzi. Anahtarin yalnizca sha256 ozeti.';
comment on table public.ajan_isleri is 'Ajan MVP kuyrugu: Mac''teki program is-al ucuyla alir, bitir ucuyla sonucu yazar.';
