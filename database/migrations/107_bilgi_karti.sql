-- 107_bilgi_karti.sql
-- Bilgi kartı: şirketin (ve serbest çalışanın işinin) künyesi, belgeleri ve özeti
--
-- SORUN
-- -----
-- Bir şirketin kendisiyle ilgili en çok sorulan bilgileri hiçbir yerde
-- durmuyordu. Vergi numarası teklif hazırlayanın WhatsApp geçmişinde, adres
-- eski bir faturanın altında, vergi levhası muhasebecinin gönderdiği e-postanın
-- ekinde, MERSİS numarası ise yalnızca kurucunun aklındaydı. Her ihtiyaç
-- duyulduğunda biri birine soruyordu.
--
-- İlginç olan, MÜŞTERİNİN aynı bilgilerinin zaten tutuluyor olmasıydı
-- (bkz. migration 046, party tablosu: tax_number, tax_office, address). Yani
-- ürün karşı tarafın künyesini biliyor, kendi kullanıcısının künyesini
-- bilmiyordu.
--
-- MODEL
-- -----
-- Üç tablo:
--   1. info_cards            — sabit künye alanları (tek satır, kapsam başına)
--   2. info_card_fields      — kullanıcının kendi eklediği alanlar
--   3. info_card_documents   — vergi levhası, imza sirküleri, sicil gazetesi…
--
-- NEDEN SABİT ALAN + SERBEST ALAN BİRLİKTE:
--   Yalnızca serbest alan (jsonb) olsaydı "vergi numarası" her şirkette başka
--   bir etiketle yazılır, hiçbir yerden sorgulanamaz ve ileride fatura/teklif
--   ekranına otomatik doldurulamazdı. Yalnızca sabit alan olsaydı, her sektörün
--   kendine özgü bilgisi (oda sicil no, ruhsat no, ihracatçı birliği üyeliği)
--   dışarıda kalırdı. Sabit alanlar sorgulanabilir omurga, serbest alanlar
--   ise kullanıcının kendi eklediği yaprak.
--
-- KAPSAM İKİ TÜR: organizasyon ya da iş. Serbest çalışanın da şahıs şirketi,
-- vergi numarası ve levhası var; onun kurumsal kademesi "iş" (bkz. jobs).
-- Tıpkı party ve module_records'ta olduğu gibi ikisinden TAM BİRİ dolu.
--
-- ÖZET BURADA DEĞİL: "kaç departman, kaç çalışan, kaç proje, ne kadar bütçe"
-- bilgileri KAYDEDİLMİYOR, her açılışta ilgili modüllerden okunuyor
-- (bkz. bilgi-karti-ozet.service.ts). Kopyalansaydı ilk günden bayatlardı ve
-- iki farklı sayı gösteren iki ekran olurdu.
--
-- GÜVENLİK MODELİ: diğer tablolarla aynı — RLS açık, politika yok; erişim
-- yalnızca service_role üzerinden, karar servis katmanında
-- (bkz. bilgi-karti-erisim.ts).

-- ---------------------------------------------------------------------------
-- 1) Künye
-- ---------------------------------------------------------------------------

create table if not exists public.info_cards (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations(id) on delete cascade,
  job_id              uuid references public.jobs(id)          on delete cascade,

  -- Kimlik
  legal_name          varchar,      -- ticari ünvan ("Projelio Yazılım A.Ş.")
  brand_name          varchar,      -- marka/kısa ad ("Projelio")
  sector              varchar,
  founded_on          date,
  employee_count      integer,
  about               text,         -- şirketi bir paragrafta anlatan metin

  -- Resmî kimlikler. Hepsi metin: başında sıfır olan numaralar sayıya
  -- çevrildiğinde bozuluyor ve hiçbiriyle aritmetik yapılmıyor.
  tax_office          varchar,      -- vergi dairesi
  tax_number          varchar,      -- VKN / TCKN
  trade_registry_no   varchar,      -- ticaret sicil no
  mersis_no           varchar,
  nace_code           varchar,      -- faaliyet kodu
  sgk_no              varchar,      -- SGK işyeri sicil no
  kep_address         varchar,      -- kayıtlı elektronik posta

  -- İletişim
  phone               varchar,
  email               varchar,
  website             varchar,
  address             text,
  district            varchar,
  city                varchar,
  country             varchar,
  postal_code         varchar,

  -- Banka. Para DEĞİL, kimlik bilgisi: bakiye/hareket burada tutulmuyor
  -- (tek defter için bkz. migration 104).
  bank_name           varchar,
  iban                varchar,

  notes               text,

  updated_by          uuid references public.users(id) on delete set null,
  created_at          timestamp not null default current_timestamp,
  updated_at          timestamp not null default current_timestamp,

  constraint info_cards_tek_kapsam check (num_nonnulls(organization_id, job_id) = 1)
);

comment on table public.info_cards is
  'Sirketin/isin kunyesi: unvan, vergi, iletisim ve adres bilgileri. Kapsam basina tek satir.';

-- Kapsam başına TEK kart. İki satır olsaydı hangisinin doğru olduğu
-- sorulamazdı; upsert bu indekse dayanıyor.
create unique index if not exists info_cards_org_uniq
  on public.info_cards(organization_id) where organization_id is not null;
create unique index if not exists info_cards_job_uniq
  on public.info_cards(job_id) where job_id is not null;

alter table public.info_cards enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Kullanıcının eklediği alanlar
-- ---------------------------------------------------------------------------
-- "Oda sicil no", "İhracatçı birliği üyeliği", "Acil durum sorumlusu" gibi
-- sabit listede olmayan her şey. Etiket serbest metin: burada kapalı liste
-- kurmanın anlamı yok, zaten sabit alanlar o listeyi oluşturuyor.

create table if not exists public.info_card_fields (
  id           uuid primary key default gen_random_uuid(),
  card_id      uuid not null references public.info_cards(id) on delete cascade,
  label        varchar not null,
  value        text,
  sort_order   integer not null default 0,
  created_at   timestamp not null default current_timestamp,
  updated_at   timestamp not null default current_timestamp
);

comment on table public.info_card_fields is
  'Bilgi kartina kullanicinin kendi ekledigi etiket/deger ciftleri.';

create index if not exists info_card_fields_card_idx on public.info_card_fields(card_id);
alter table public.info_card_fields enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Belgeler
-- ---------------------------------------------------------------------------
-- KAYNAK İKİ TÜRLÜ: Projelio'daki bir dosya (files) ya da dış bağlantı.
-- Dış bağlantı gerçek bir ihtiyaç: e-Devlet'teki vergi levhası doğrulama
-- adresi ya da muhasebecinin paylaştığı klasör indirilip yüklenecek bir şey
-- değil. İkisinden TAM BİRİ dolu — aynı belgenin iki kaynağı olsaydı hangisinin
-- güncel olduğu belirsiz kalırdı.
--
-- DOSYA TAŞINMIYOR: file_id yalnızca işaret eder, dosya kendi klasöründe kalır
-- (bkz. migration 095'teki aynı gerekçe). Dosya silinirse belge satırı da
-- gider — kaynağı olmayan bir belge kaydı, kullanıcıya "belgen var" deyip
-- açılmayan bir satır göstermek olurdu.
--
-- GEÇERLİLİK TARİHİ: vergi levhası yıllık, imza sirküleri ve faaliyet belgesi
-- süreli. Kart süresi geçmiş belgeyi uyarıyla gösterir; hatırlatmanın tek
-- şartı tarihin kayıtlı olması.

create table if not exists public.info_card_documents (
  id            uuid primary key default gen_random_uuid(),
  card_id       uuid not null references public.info_cards(id) on delete cascade,

  doc_type      varchar not null default 'diger'
                  check (doc_type in ('vergi_levhasi','imza_sirkuleri','ticaret_sicil_gazetesi',
                                      'faaliyet_belgesi','vergi_mukellefiyet_yazisi','sgk_belgesi',
                                      'kimlik','sozlesme','ruhsat','sigorta_policesi','marka_tescil',
                                      'logo','diger')),
  title         varchar not null,
  file_id       uuid references public.files(id) on delete cascade,
  external_url  text,

  issued_on     date,
  valid_until   date,
  note          text,

  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamp not null default current_timestamp,

  constraint info_card_documents_kaynak check (num_nonnulls(file_id, external_url) = 1)
);

comment on table public.info_card_documents is
  'Bilgi kartina asili belgeler: Projelio dosyasi ya da dis baglanti. Gecerlilik tarihi kartta uyari uretir.';

create index if not exists info_card_documents_card_idx on public.info_card_documents(card_id);
alter table public.info_card_documents enable row level security;
