-- 194: Proje şablonları (kullanıcı kararı, 2026-11-10).
--
-- Bir proje "şablon olarak kaydet" ile iskeletine indirgenir (çıktılar,
-- görevler, alt görevler, bağımlılıklar, takvim etkinlikleri — tarihler
-- projenin başlangıcına GÖRE gün olarak) ve yeni proje doğrudan şablondan
-- açılır. İçeriğin biçimi ve doğrulaması packages/shared/src/projeSablonu.ts'te;
-- burada yalnızca saklama var.
--
-- Kapsam: kaydeden seçer —
--   kisisel: yalnızca kaydeden görür (organization_id boş),
--   sirket:  şirketin BÜTÜN çalışanları görür (taşeron hariç, bkz.
--            AccessService.calistigiSirketler); yalnızca şirket sahibi ve
--            departman yöneticisi kaydeder.
-- Hazır şablonlar (web sitesi, etkinlik, sosyal medya, ürün lansmanı) kodda
-- sabit; bu tabloya tohum YAZILMAZ.
--
-- Şablonda KİŞİ yok (atama, ekip): şablon başka bir ekipte açılabilir.
--
-- GÜVENLİK: RLS açık, politika yok — erişim yalnızca ProjeSablonlariService
-- üzerinden.
--
-- IDEMPOTENT. Geri alma: database/geri-al/194_proje_sablonlari_geri_al.sql

create table if not exists public.proje_sablonlari (
  id               uuid primary key default gen_random_uuid(),
  ad               varchar(150) not null,
  aciklama         text,
  kapsam           varchar(10) not null,
  organization_id  uuid references public.organizations(id) on delete cascade,
  -- Kaydeden hesabını silerse şirket şablonu yaşamaya devam eder; kişisel
  -- şablon ise sahipsiz kalıp kimseye görünmez (servis süzer).
  olusturan_id     uuid references public.users(id) on delete set null,
  -- Hangi projeden kaydedildiği yalnızca bilgi: proje silinse de şablon kalır.
  kaynak_proje_id  uuid,
  icerik           jsonb not null,
  created_at       timestamptz not null default now(),

  constraint proje_sablonlari_ad_bos_degil check (length(btrim(ad)) > 0),
  constraint proje_sablonlari_kapsam check (kapsam in ('kisisel', 'sirket')),
  constraint proje_sablonlari_kapsam_sirket check ((kapsam = 'sirket') = (organization_id is not null))
);

comment on table public.proje_sablonlari is
  'Proje sablonlari (194): projenin tarihsiz iskeleti. kisisel = yalnizca kaydeden, sirket = sirketin butun calisanlari.';

create index if not exists proje_sablonlari_olusturan_idx
  on public.proje_sablonlari (olusturan_id) where kapsam = 'kisisel';
create index if not exists proje_sablonlari_sirket_idx
  on public.proje_sablonlari (organization_id) where kapsam = 'sirket';

alter table public.proje_sablonlari enable row level security;
