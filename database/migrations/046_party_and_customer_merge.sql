-- 046_party_and_customer_merge.sql
-- Ortak varlık: party. Ve müşteri modülünün birleştirilmesi.
--
-- SORUN:
--   "Müşteri Modülü" katalogda iki kez vardı: mid_musteri_modulu (Müşteri
--   İlişkileri) ve spd_musteri_modulu (Satış). İkisi aynı arayüzü kullanıyor
--   ama AYRI module_key ile AYRI kayıt yazıyordu. Yani Satış'ın girdiği
--   "ABC Ltd." ile Müşteri İlişkileri'nin girdiği "ABC Ltd." iki farklı
--   kayıttı; iki departman aynı müşteriyi ayrı ayrı besliyor ve birbirini
--   görmüyordu.
--
--   Bu, modül mimarisinin 1. ilkesinin ihlaliydi: "varlık modülden bağımsızdır;
--   modül veriyi sahiplenmez, ortak bir varlığa açılan penceredir."
--
-- ÇÖZÜM:
--   1. party — dış dünyadaki kişi/kurumların TEK kaydı. Rol bir alandır
--      (customer/lead/supplier/candidate/distributor), tablo değil: aynı firma
--      hem müşteri hem tedarikçi olabilir ve adresi tek yerde durur.
--   2. party_contact — kurumdaki kişiler. B2B'de firma bir, muhatap birden
--      fazladır ve muhatap değişir, firma kalır.
--   3. party_activity — tüm temas geçmişi. Diğer modüller de buraya yazar
--      (fırsat aşaması, destek talebi, fatura); müşteri kartı tek akışta
--      her şeyi gösterir.
--   4. module_catalog_departments — bir modül birden fazla departmana
--      açılabilsin. crm_musteri hem Satış hem Müşteri İlişkileri'nde.
--
-- VERİ KAYBI YOK: mid_musteri_modulu / spd_musteri_modulu anahtarları hiçbir
-- yerde kullanılmıyordu (0 module_records, 0 organization_modules, 0 job_modules,
-- 0 partner_module_grants). Birleştirme bu yüzden şimdi bedava; geciktikçe
-- taşınacak veri birikirdi.
--
-- Yetkilendirme deseni: RLS açık, policy yok (yetki NestJS'te, service_role ile).
--
-- Bkz. docs/moduller/03-ortak-varlik-party.md ve 11-modul-crm_musteri.md

-- ============================================== 1. party

create table public.party (
  id               uuid primary key default gen_random_uuid(),

  -- Sahiplik: module_records ile aynı desen — şirket ya da serbest çalışanın işi.
  organization_id  uuid references public.organizations(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete cascade,

  party_type       varchar not null default 'company' check (party_type in ('person', 'company')),
  display_name     varchar not null,
  legal_name       varchar,

  -- Fatura kesilecekse zorunlu hale gelir; organizasyon içinde benzersizdir
  -- (aşağıdaki kısmi indeks). Tekilleştirmenin en güvenilir dayanağı budur.
  tax_number       varchar,
  tax_office       varchar,

  email            varchar,
  phone            varchar,
  website          varchar,
  address          jsonb,

  -- Rol bir alandır, tablo değil: aynı firma hem müşteri hem tedarikçi olabilir.
  roles            text[] not null default '{lead}',
  status           varchar not null default 'active' check (status in ('active', 'passive', 'blocked')),
  source           varchar,

  owner_user_id    uuid references public.users(id) on delete set null,
  parent_party_id  uuid references public.party(id) on delete set null,
  linked_user_id   uuid references public.users(id) on delete set null,
  -- Yinelenen kayıt birleştirildiğinde kaynak silinmez, hedefe işaret eder.
  merged_into_id   uuid references public.party(id) on delete set null,

  -- Organizasyona özel ek alanlar (ör. inşaat şirketi için "Ruhsat No").
  data             jsonb not null default '{}'::jsonb,
  notes            text,

  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp,
  updated_at       timestamp not null default current_timestamp,
  archived_at      timestamp,

  constraint party_owner_chk check (
    (organization_id is not null and job_id is null)
    or (organization_id is null and job_id is not null)
  ),
  constraint party_name_chk check (length(btrim(display_name)) > 0)
);

comment on table public.party is
  'Dis dunyadaki kisi/kurumlarin tek kaydi: musteri, tedarikci, aday, bayi. Rol bir alandir (roles), tablo degil — ayni firma birden fazla rolde olabilir. crm_musteri, oud_tedarik, ik_ise_alim gibi moduller bu varliga bakar.';
comment on column public.party.roles is
  'lead | customer | supplier | candidate | distributor | other. Rol EKLENIR, silinmez: ilk fatura kesilince lead uzerine customer eklenir, gecmis kaybolmaz.';
comment on column public.party.merged_into_id is
  'Yinelenen kayit birlestirildiginde kaynak kayit silinmez, hedefi gosterir. Geri alinabilir olmasi icin.';
comment on column public.party.data is
  'Organizasyona ozel ek alanlar. Filtrelenebilir ve disa aktarilabilir ama metrik yayinlamaz — aksi halde sema kontrolsuz buyur.';

-- Vergi numarası tekilliği: aynı organizasyonda aynı VKN iki kez girilemez.
-- Birleştirilmiş ve arşivlenmiş kayıtlar hariç tutulur.
create unique index party_org_tax_uniq
  on public.party(organization_id, tax_number)
  where organization_id is not null and tax_number is not null
    and merged_into_id is null and archived_at is null;

create unique index party_job_tax_uniq
  on public.party(job_id, tax_number)
  where job_id is not null and tax_number is not null
    and merged_into_id is null and archived_at is null;

create index party_org_idx on public.party(organization_id)
  where organization_id is not null and archived_at is null and merged_into_id is null;
create index party_job_idx on public.party(job_id)
  where job_id is not null and archived_at is null and merged_into_id is null;
-- "Rolü müşteri olanlar" gibi sorgular listenin varsayılan filtresi.
create index party_roles_idx on public.party using gin(roles);
create index party_owner_idx on public.party(owner_user_id) where owner_user_id is not null;

alter table public.party enable row level security;

-- ============================================== 2. party_contact

create table public.party_contact (
  id           uuid primary key default gen_random_uuid(),
  party_id     uuid not null references public.party(id) on delete cascade,
  name         varchar not null,
  title        varchar,
  email        varchar,
  phone        varchar,
  is_primary   boolean not null default false,
  notes        text,
  created_at   timestamp not null default current_timestamp,
  archived_at  timestamp
);

comment on table public.party_contact is
  'Kurumdaki kisiler. B2B''de firma bir, muhatap birden fazladir ve muhatap degisir, firma kalir.';

create index party_contact_party_idx on public.party_contact(party_id) where archived_at is null;
-- Bir kurumda yalnızca bir birincil muhatap olabilir.
create unique index party_contact_primary_uniq
  on public.party_contact(party_id) where is_primary and archived_at is null;

alter table public.party_contact enable row level security;

-- ============================================== 3. party_activity

create table public.party_activity (
  id            uuid primary key default gen_random_uuid(),
  party_id      uuid not null references public.party(id) on delete cascade,
  type          varchar not null default 'not'
                  check (type in ('not', 'arama', 'toplanti', 'eposta', 'teklif', 'ziyaret', 'sistem')),
  occurred_at   timestamp not null default current_timestamp,
  summary       text not null,
  user_id       uuid references public.users(id) on delete set null,

  -- Diger moduller de buraya yazar: hangi modulun hangi kaydi bu aktiviteyi
  -- uretti. Musteri kartinda tek akista fatura, talep ve firsat birlikte gorunur.
  related_type  varchar,
  related_id    uuid,

  created_at    timestamp not null default current_timestamp
);

comment on table public.party_activity is
  'Tum temas gecmisi. Manuel notlarin yani sira diger moduller de yazar (related_type/related_id) — "moduller birbirini besliyor" tezinin en gorunur kaniti.';
comment on column public.party_activity.type is
  'sistem: kullanici degil, baska bir modul tarafindan uretilen kayit (rol degisimi, fatura kesildi vb.).';

create index party_activity_party_idx on public.party_activity(party_id, occurred_at desc);
create index party_activity_related_idx on public.party_activity(related_type, related_id)
  where related_type is not null;

alter table public.party_activity enable row level security;

-- ============================================== 4. Modül–departman çoklu ilişkisi
-- module_catalog.department_key bir modülü tek departmana kilitliyordu. Oysa
-- küçük işletmede bir kişi hem satış hem müşteri ilişkileri yapar; departman
-- bir zorunluluk değil, öneridir.

create table public.module_catalog_departments (
  module_key     varchar not null references public.module_catalog(key) on delete cascade,
  department_key varchar not null references public.department_catalog(key) on delete cascade,
  is_primary     boolean not null default false,
  sort_order     integer not null default 0,
  primary key (module_key, department_key)
);

comment on table public.module_catalog_departments is
  'Bir modulun onerildigi departmanlar. module_catalog.department_key''in cok-a-cok hali; is_primary eski tekil kolonun karsiligidir.';

-- Mevcut tekil eşlemeler taşınıyor (holding modüllerinin departmanı yok).
insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
select key, department_key, true, sort_order
from public.module_catalog
where department_key is not null;

create index module_catalog_departments_dept_idx
  on public.module_catalog_departments(department_key);

alter table public.module_catalog_departments enable row level security;

-- ============================================== 5. Müşteri modülü birleşmesi

insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('crm_musteri', 'satis_is_gelistirme', 'Müşteri',
   'Temas edilen tüm kişi ve kurumların tek kaydı; kimin ne zaman ne konuştuğu, neyi satın aldığı ve hangi sorunu yaşadığı tek karttan görülür.',
   'organization', true, 10);

-- Tek modül, iki departman. is_primary yalnızca eski tekil kolonla tutarlılık için.
insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values ('crm_musteri', 'satis_is_gelistirme', true,  10),
       ('crm_musteri', 'musteri_iliskileri',  false, 10);

-- Eski iki anahtar siliniyor. Güvenli: hiçbir tabloda referansları yok
-- (module_records, organization_modules, job_modules, module_members,
-- partner_module_grants — hepsi boş kontrol edildi). Yine de bir referans
-- kalmışsa FK cascade değil, hata vermesi için önce kontrol ediyoruz.
do $$
declare kalan integer;
begin
  select
    (select count(*) from public.module_records      where module_key in ('mid_musteri_modulu','spd_musteri_modulu'))
  + (select count(*) from public.organization_modules where module_key in ('mid_musteri_modulu','spd_musteri_modulu'))
  + (select count(*) from public.job_modules          where module_key in ('mid_musteri_modulu','spd_musteri_modulu'))
  + (select count(*) from public.module_members       where module_key in ('mid_musteri_modulu','spd_musteri_modulu'))
  into kalan;

  if kalan > 0 then
    raise exception 'Eski musteri modulu anahtarlarina % referans var; once bunlar crm_musteri''ye tasinmali.', kalan;
  end if;
end $$;

delete from public.module_catalog_departments
  where module_key in ('mid_musteri_modulu', 'spd_musteri_modulu');
delete from public.module_catalog
  where key in ('mid_musteri_modulu', 'spd_musteri_modulu');
