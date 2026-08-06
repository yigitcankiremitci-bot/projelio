-- 028_module_records.sql
-- Etkinleştirilen bazı modüller (Gelir-Gider, Fatura, Müşteri, İşe Alım ve
-- Oryantasyon) artık gerçek veri girişi yapılabilen tam özellikli araçlar.
-- Her modülün alanları farklı olduğu için tek, esnek bir tablo kullanılıyor
-- (data jsonb) — yeni bir modül tam özellikli yapılacaksa yeni bir tabloya
-- gerek kalmadan sadece frontend'deki alan tanımı (moduleRecordConfigs)
-- eklenir.

create table public.module_records (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete set null,
  module_key       varchar not null references public.module_catalog(key) on delete cascade,
  data             jsonb not null default '{}'::jsonb,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp,
  archived_at      timestamp
);

comment on table public.module_records is
  'Tam ozellikli hale getirilen moduller (Gelir-Gider, Fatura, Musteri, Ise Alim vb.) icin genel kayit tablosu. Alanlar data jsonb icinde tutulur, modul_key''e gore frontend farkli form render eder.';

create index module_records_org_idx on public.module_records(organization_id) where archived_at is null;
create index module_records_dept_idx on public.module_records(department_id) where department_id is not null;
create index module_records_module_key_idx on public.module_records(organization_id, module_key) where archived_at is null;

alter table public.module_records enable row level security;
