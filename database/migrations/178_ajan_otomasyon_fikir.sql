-- 178_ajan_otomasyon_fikir.sql
-- Ajan öğrendiğini KULLANSIN: iş bitirici fikirler ve zamanlanmış otomasyonlar.
--
-- NEDEN
-- -----
-- 177'deki ajan öğreniyor ve rapor yazıyordu ama bunlar kullanıcıda bir işe
-- dönüşmüyordu. Kullanıcının isteği (2026-11-02): ajan araştırmalarını şirketin
-- faydasına olacak, bitirilebilir işlere çevirsin, fikir üretsin, kendi başına
-- düzenli çalışsın.
--
--   ajan_onerileri.tur = 'fikir'  Ajanın önerdiği iş: fayda + somut adımlar +
--                                 etki/emek. Kullanıcı yapılacaklara çevirir,
--                                 araştırtır ya da gerekçesiyle reddeder;
--                                 kararlar sonraki fikirlerde ajana geri gider.
--   ajan_isleri.tur = 'fikir'     Boşta: yeni öğrendiklerinden fikir çıkarma.
--   ajan_isleri.tur = 'otomasyon' Kullanıcının kurduğu zamanlanmış görev.
--   ajan_otomasyonlari            Görevin talimatı ve zamanı. Zaman Türkiye
--                                 saatiyle tutulur (bkz. ajanSonrakiCalisma).
--
-- Ajan yine Projelio'ya kendisi YAZMAZ: fikir de yapılacak da onay bekler.

alter table public.ajan_isleri drop constraint if exists ajan_isleri_tur_check;
alter table public.ajan_isleri
  add constraint ajan_isleri_tur_check check (tur in ('sohbet', 'arastirma', 'ogrenme', 'liste', 'fikir', 'otomasyon'));

alter table public.ajan_onerileri drop constraint if exists ajan_onerileri_tur_check;
alter table public.ajan_onerileri
  add constraint ajan_onerileri_tur_check check (tur in ('yapilacak', 'fikir'));

-- Reddedilen fikrin gerekçesi: ajan "bunu neden istemediğini" öğrensin.
alter table public.ajan_onerileri add column if not exists yanit_notu varchar(500);
alter table public.ajan_onerileri add column if not exists yanit_at timestamptz;

create table if not exists public.ajan_otomasyonlari (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  ad          varchar(120) not null,
  talimat     text not null,
  siklik      varchar(10) not null check (siklik in ('gunluk', 'haftalik', 'aylik')),
  -- Türkiye saatiyle 0-23.
  saat        smallint not null default 9 check (saat between 0 and 23),
  -- haftalik: 1 (pazartesi) - 7 (pazar); aylik: ayın 1-28'i. Günlükte yok sayılır.
  gun         smallint not null default 1 check (gun between 1 and 28),
  acik        boolean not null default true,
  son_calisma timestamptz,
  sonraki     timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ajan_otomasyonlari_vade_idx on public.ajan_otomasyonlari (user_id, acik, sonraki);

alter table public.ajan_isleri add column if not exists otomasyon_id uuid references public.ajan_otomasyonlari(id) on delete set null;

alter table public.ajan_otomasyonlari enable row level security;
