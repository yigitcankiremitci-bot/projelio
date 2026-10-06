-- 149_bulten_aboneleri.sql
-- Tanıtım sitesindeki (projelio.app) "Gelişmelerden haberdar olun" bülten
-- formu ve Admin > Bülten listesi.
--
-- Bunlar ÜYE DEĞİL: hesabı olmayan ziyaretçiler de abone olabiliyor, o yüzden
-- users'a bağ yok. Bir adres tek satırdır — sunucu adresi küçük harfe çevirip
-- yazar, tekil indeks düz sütunda (ifade indeksi PostgREST'in upsert'üyle
-- kullanılamıyor);
-- aynı kişinin ikinci kez abone olması satırı çoğaltmaz, yalnızca iptal
-- edilmişse yeniden açar.
--
-- İZİN KAYDI: ticari elektronik ileti için açık rıza gerekiyor (6563 sayılı
-- Kanun). Formdaki onay kutusu sunucuda da zorunlu; rızanın ne zaman ve hangi
-- dilde verildiği `izin_at` + `dil` ile saklanıyor — ileride "bu kişi ne zaman
-- izin verdi?" sorusunun cevabı bu satır.
--
-- GÜVENLİK: diğer servis tablolarıyla aynı model — RLS açık, politika yok,
-- erişim yalnızca backend'in servis anahtarıyla.

create table if not exists public.bulten_aboneleri (
  id           uuid primary key default gen_random_uuid(),
  eposta       text not null,
  dil          text not null default 'tr',
  kaynak       text,                       -- formun bulunduğu sayfa (ör. "/tr/pricing")
  izin_at      timestamptz not null default now(),
  iptal_at     timestamptz,                -- null = aktif abone
  created_at   timestamptz not null default now()
);

create unique index if not exists bulten_aboneleri_eposta_uniq
  on public.bulten_aboneleri (eposta);

create index if not exists bulten_aboneleri_created_idx
  on public.bulten_aboneleri (created_at desc);

alter table public.bulten_aboneleri enable row level security;
