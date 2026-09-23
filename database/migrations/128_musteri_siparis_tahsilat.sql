-- 128_musteri_siparis_tahsilat.sql
-- Müşteri siparişleri ve tahsilat takibi
--
-- NE İÇİN
-- -------
-- Müşteri kartı (party) bir satış çalışanına atanır (`party.owner_user_id`).
-- Çalışan kendi müşterilerinin siparişlerini girer, vadesi gelen tutarı ay ay
-- takip eder ve "tahsil edildi" diye işaretler; yönetici çalışan × ay kırılımında
-- neyin geldiğini, neyin geciktiğini görür.
--
-- İKİ TABLO
-- ---------
-- musteri_siparisleri  — sipariş: tarih, vade (gün), miktar, tutar, ödeme yöntemi
-- musteri_tahsilatlari — siparişe gelen her ödeme. KISMİ tahsilat mümkün:
--                        10.000 TL'lik siparişin 4.000'i bugün, kalanı ay sonu.
-- Siparişin durumu (bekliyor / kısmi / tahsil edildi / gecikti) SAKLANMAZ,
-- tahsilatlardan hesaplanır (packages/shared/src/tahsilat.ts). Saklansaydı
-- bir tahsilat silindiğinde güncellenmeyi unutulan bir sütun olurdu.
--
-- KASA BAĞI
-- ---------
-- Her tahsilat şirketin (ya da serbest çalışanın işinin) defterine bir `income`
-- satırı yazar: source = 'tahsilat', tahsilat_id ile bağlı. Görev bütçesindeki
-- "ödendi" akışıyla aynı desen:
--   * tahsilat başına TEK defter satırı (kısmi tekil indeks) — "tahsil et"e iki
--     kez basmak geliri iki kez yazmasın;
--   * tahsilat silinince (geri al) defter satırı da gider (on delete cascade);
--   * satır defterden elle düzenlenemez/silinemez — kaynağından yönetilir
--     (bkz. budget.service.ts). Aksi hâlde kasa ile tahsilat raporu ayrışırdı.
-- Satır kademenin kendisine yazılır (organization_id ya da job_id), departmana
-- DEĞİL: müşteri şirketindir, satış departmanının değil. Tek kademe kuralı
-- (budget_tx_single_parent) böylece korunuyor.
--
-- Kur dönüşümü YOK: tahsilat siparişin para biriminde yazılır.

-- ============================================================ 1. Siparişler

create table if not exists public.musteri_siparisleri (
  id               uuid primary key default gen_random_uuid(),
  party_id         uuid not null references public.party(id) on delete cascade,
  -- Kapsam müşteri kartından kopyalanır: kapsama göre listeleme party'ye
  -- join atmadan yapılabilsin, defter satırı hangi kademeye yazılacağını bilsin.
  organization_id  uuid references public.organizations(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete cascade,

  siparis_no       varchar,
  -- Ne satıldı: serbest metin ("200 koli A4 kağıt").
  aciklama         varchar,
  miktar           numeric,
  birim            varchar,
  tutar            numeric not null check (tutar > 0),
  para_birimi      varchar(3) not null default 'TRY',

  siparis_tarihi   date not null,
  vade_gun         integer not null default 0 check (vade_gun >= 0 and vade_gun <= 3650),
  -- Hesaplanan sütun: vade tarihi iki yerde tutulup ayrışmasın.
  vade_tarihi      date generated always as (siparis_tarihi + vade_gun) stored,

  odeme_yontemi    varchar not null default 'havale'
    check (odeme_yontemi in ('nakit', 'havale', 'kredi_karti', 'cek', 'senet', 'diger')),
  -- Çek / senet: evrakın numarası ve üzerindeki vade (sipariş vadesinden
  -- farklı olabilir — 30 gün vadeli satış 90 günlük çekle kapatılabilir).
  evrak_no         varchar,
  evrak_vadesi     date,

  notlar           text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp,
  updated_at       timestamp not null default current_timestamp,

  constraint musteri_siparis_kapsam_chk check (
    (organization_id is not null and job_id is null)
    or (organization_id is null and job_id is not null)
  )
);

create index if not exists musteri_siparisleri_party_idx on public.musteri_siparisleri(party_id);
create index if not exists musteri_siparisleri_org_idx
  on public.musteri_siparisleri(organization_id, vade_tarihi) where organization_id is not null;
create index if not exists musteri_siparisleri_job_idx
  on public.musteri_siparisleri(job_id, vade_tarihi) where job_id is not null;

alter table public.musteri_siparisleri enable row level security;

comment on table public.musteri_siparisleri is
  'Musteri kartina (party) bagli siparis. Durum saklanmaz, musteri_tahsilatlari toplamindan hesaplanir. Siparisin sorumlusu musterinin sorumlusudur (party.owner_user_id).';

-- ============================================================ 2. Tahsilatlar

create table if not exists public.musteri_tahsilatlari (
  id               uuid primary key default gen_random_uuid(),
  siparis_id       uuid not null references public.musteri_siparisleri(id) on delete cascade,
  tutar            numeric not null check (tutar > 0),
  tarih            date not null,
  odeme_yontemi    varchar not null default 'havale'
    check (odeme_yontemi in ('nakit', 'havale', 'kredi_karti', 'cek', 'senet', 'diger')),
  evrak_no         varchar,
  evrak_vadesi     date,
  notlar           text,
  -- Kimin tahsil ettiği: müşteri sonradan başka çalışana devredilse de
  -- geçmişteki tahsilatın sahibi değişmez.
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp
);

create index if not exists musteri_tahsilatlari_siparis_idx on public.musteri_tahsilatlari(siparis_id);

alter table public.musteri_tahsilatlari enable row level security;

-- ============================================================ 3. Defter bağı

alter table public.budget_transactions
  add column if not exists tahsilat_id uuid references public.musteri_tahsilatlari(id) on delete cascade;

create unique index if not exists budget_transactions_tahsilat_uniq
  on public.budget_transactions(tahsilat_id) where tahsilat_id is not null;

alter table public.budget_transactions drop constraint if exists budget_transactions_source_check;
alter table public.budget_transactions
  add constraint budget_transactions_source_check
    check (source in ('manual', 'task_budget', 'recurring', 'tahsilat'));

comment on column public.budget_transactions.source is
  'Kaydin nereden dogdugu: manual (elle) | task_budget (onaylanan gorev butcesi odenince) | recurring (duzenli odemenin vadesi gelince) | tahsilat (musteri siparisine gelen odeme).';
comment on column public.budget_transactions.tahsilat_id is
  'source=tahsilat satirinin kaynagi. Tahsilat basina TEK satir; tahsilat silinince satir da silinir.';
