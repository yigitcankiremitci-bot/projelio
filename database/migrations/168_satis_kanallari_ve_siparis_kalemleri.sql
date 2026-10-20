-- 168_satis_kanallari_ve_siparis_kalemleri.sql
-- Satış kanalları ve çok kalemli müşteri siparişi
--
-- NE İÇİN
-- -------
-- İlk büyük sipariş yüklemesi (CARMED İLAÇ, 2026 kargo listesi) bugünkü şemaya
-- sığmadı:
--   * Bir satırda birden çok ürün var; sipariş ise TEK ürüne bağlanabiliyordu
--     (product_id, migration 165). Ürün kartının Satışlar sekmesi çok ürünlü
--     siparişin yalnızca birini görürdü.
--   * Alıcıların çoğu Trendyol'dan, kendi sitesinden bir kez alan son kullanıcı.
--     Her birine müşteri kartı açmak defteri binlerce tek seferlik kartla
--     boğardı; bu siparişler bir KANALA toplanır, alıcının adı siparişte durur.
--
-- KANAL
-- -----
-- satis_kanallari — siparişin geldiği yer (pazaryeri, kendi sitesi, eczane
-- satışı...). Varsayılan vade ve ödeme yöntemi kanaldan gelir: pazaryeri
-- parayı 30 günde öder, eczane 60 günde; tahsilatsız yüklenen geçmiş
-- siparişler vadesi 0 olsa raporda hepsi "gecikti" görünürdü.
-- Kanalın SORUMLUSU müşterisiz siparişin sorumlusudur (yetki ve rapor
-- kırılımı için); müşteri kartı olan siparişte sorumlu yine kartın sahibi.
--
-- MÜŞTERİSİZ SİPARİŞ
-- ------------------
-- party_id artık boş olabilir; o zaman kanal ŞART (kısıt). Sipariş ya bir
-- müşterinin ya bir kanalın — sahipsiz sipariş kimsenin raporuna girmez.
--
-- KALEMLER
-- --------
-- musteri_siparis_kalemleri — siparişin satırları. Siparişin `tutar`ı kalem
-- toplamıdır; eşitlik sunucuda korunur (SiparisService), veritabanında
-- tetikleyici YOK: tutarın tek yazıldığı yer servis, tetikleyici ikinci bir
-- doğruluk kaynağı olurdu.
-- liste_birim_fiyat: kalem yazılırken katalogdaki KDV dahil fiyat. Pazarlıklı
-- ya da pazaryeri fiyatıyla satılan malın "katalogdan ne kadar sapmış"
-- sorusunun cevabı; ürün fiyatı sonradan değişse de satış anındaki kalır.
--
-- ESKİ SÜTUNLAR
-- -------------
-- musteri_siparisleri.product_id / miktar / birim bu sürümde KALIR ama artık
-- yazılmaz: geri alma betiği kalemleri silince eski siparişler eski hâline
-- dönebilsin. Sonraki bir migration kaldırır.

-- ============================================================ 1. Kanallar

create table if not exists public.satis_kanallari (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid references public.organizations(id) on delete cascade,
  job_id                    uuid references public.jobs(id) on delete cascade,
  ad                        varchar not null check (length(trim(ad)) > 0),
  tur                       varchar not null default 'diger'
    check (tur in ('pazaryeri', 'web', 'eczane', 'doktor', 'bayi', 'diger')),
  varsayilan_vade_gun       integer not null default 0
    check (varsayilan_vade_gun >= 0 and varsayilan_vade_gun <= 3650),
  varsayilan_odeme_yontemi  varchar not null default 'havale'
    check (varsayilan_odeme_yontemi in ('nakit', 'havale', 'kredi_karti', 'cek', 'senet', 'diger')),
  sorumlu_user_id           uuid references public.users(id) on delete set null,
  aktif                     boolean not null default true,
  sira                      integer not null default 0,
  created_by                uuid references public.users(id) on delete set null,
  created_at                timestamp not null default current_timestamp,
  updated_at                timestamp not null default current_timestamp,

  constraint satis_kanali_kapsam_chk check (
    (organization_id is not null and job_id is null)
    or (organization_id is null and job_id is not null)
  )
);

-- Aynı adlı iki kanal içe aktarmada "TRENDYOL" satırının hangisine gideceğini
-- belirsiz bırakırdı.
create unique index if not exists satis_kanallari_org_ad_uniq
  on public.satis_kanallari(organization_id, lower(trim(ad))) where organization_id is not null;
create unique index if not exists satis_kanallari_job_ad_uniq
  on public.satis_kanallari(job_id, lower(trim(ad))) where job_id is not null;

alter table public.satis_kanallari enable row level security;

comment on table public.satis_kanallari is
  'Siparisin geldigi satis kanali. Varsayilan vade/odeme yontemi buradan; sorumlu = musterisiz siparislerin sorumlusu.';

-- ============================================================ 2. Sipariş: kanal ve alıcı

alter table public.musteri_siparisleri alter column party_id drop not null;

alter table public.musteri_siparisleri
  add column if not exists kanal_id uuid references public.satis_kanallari(id) on delete set null;
alter table public.musteri_siparisleri add column if not exists alici_adi varchar;
alter table public.musteri_siparisleri add column if not exists alici_il varchar;
alter table public.musteri_siparisleri add column if not exists alici_ilce varchar;

-- Kanal silinirse (set null) müşterisiz sipariş sahipsiz kalırdı; kanal bu
-- yüzden silinmez, pasife alınır (SatisKanallariService). Kısıt yine de
-- veritabanı düzeyinde son güvence.
alter table public.musteri_siparisleri drop constraint if exists musteri_siparis_sahip_chk;
alter table public.musteri_siparisleri
  add constraint musteri_siparis_sahip_chk check (party_id is not null or kanal_id is not null);

create index if not exists musteri_siparisleri_kanal_idx
  on public.musteri_siparisleri(kanal_id) where kanal_id is not null;

alter table public.musteri_siparisleri drop constraint if exists musteri_siparisleri_kaynak_check;
alter table public.musteri_siparisleri
  add constraint musteri_siparisleri_kaynak_check check (kaynak in ('elle', 'shopify', 'excel'));

comment on column public.musteri_siparisleri.kaynak is
  'elle = kullanici girdi; shopify = webhook ile geldi (dis_kimlik = Shopify siparis id); excel = toplu ice aktarma (dis_kimlik = satirin karmasi).';
comment on column public.musteri_siparisleri.kanal_id is
  'Siparisin geldigi kanal. party_id bossa ZORUNLU (tek seferlik alici kanala toplanir).';
comment on column public.musteri_siparisleri.alici_adi is
  'Musteri karti olmayan siparisin alicisi (kargo adi).';

-- ============================================================ 3. Kalemler

create table if not exists public.musteri_siparis_kalemleri (
  id                 uuid primary key default gen_random_uuid(),
  siparis_id         uuid not null references public.musteri_siparisleri(id) on delete cascade,
  product_id         uuid references public.products(id) on delete set null,
  aciklama           varchar,
  miktar             numeric not null default 1 check (miktar > 0),
  birim              varchar,
  birim_fiyat        numeric not null check (birim_fiyat >= 0),
  liste_birim_fiyat  numeric check (liste_birim_fiyat >= 0),
  tutar              numeric not null check (tutar >= 0),
  sira               integer not null default 0,
  created_at         timestamp not null default current_timestamp,

  -- Ürünsüz kalemin ne olduğu yazılı olmalı; boş satır raporda "?" olurdu.
  constraint siparis_kalemi_tanim_chk check (product_id is not null or aciklama is not null)
);

create index if not exists musteri_siparis_kalemleri_siparis_idx
  on public.musteri_siparis_kalemleri(siparis_id, sira);
create index if not exists musteri_siparis_kalemleri_product_idx
  on public.musteri_siparis_kalemleri(product_id) where product_id is not null;

alter table public.musteri_siparis_kalemleri enable row level security;

comment on table public.musteri_siparis_kalemleri is
  'Siparisin satirlari. Siparisin tutari kalem toplamidir (SiparisService korur). liste_birim_fiyat = satis anindaki KDV dahil katalog fiyati.';

-- ============================================================ 4. Geri doldurma
--
-- Her mevcut siparişe tek kalem: ürünü, açıklaması, miktarı aynen. Birim
-- fiyat = tutar / miktar; miktar yoksa 1 adet × tutar. Ürünü de açıklaması da
-- olmayan sipariş "Sipariş" adlı kalem alır (tanım kısıtı).

insert into public.musteri_siparis_kalemleri (siparis_id, product_id, aciklama, miktar, birim, birim_fiyat, tutar, sira)
select
  s.id,
  s.product_id,
  case when s.product_id is null then coalesce(nullif(trim(s.aciklama), ''), 'Sipariş') else nullif(trim(s.aciklama), '') end,
  coalesce(nullif(s.miktar, 0), 1),
  s.birim,
  round(s.tutar / coalesce(nullif(s.miktar, 0), 1), 4),
  s.tutar,
  0
from public.musteri_siparisleri s
where not exists (select 1 from public.musteri_siparis_kalemleri k where k.siparis_id = s.id);
