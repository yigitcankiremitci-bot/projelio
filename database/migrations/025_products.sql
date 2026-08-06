-- 025_products.sql
-- "Ürün Yönetimi" departmanından eklenen ürünler. Şirket anasayfasında
-- (OrganizationDetail "Ürünler" sekmesi) iş kartlarıyla aynı görünümde listelenir.
--
-- department_id genellikle organizasyonun catalog_key='urun_yonetimi' olan
-- departmanına işaret eder ama zorunlu değil (departman silinirse null'a düşer,
-- ürün organizasyon altında kalmaya devam eder).

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  department_id    uuid references public.departments(id) on delete set null,
  name             varchar not null,
  description      text,
  cover_image_url  varchar,
  price            numeric(12,2),
  currency         varchar not null default 'TRY',
  sort_order       integer not null default 0,
  archived_at      timestamp,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamp not null default current_timestamp
);

comment on table public.products is
  'Bir organizasyonun (genelde Urun Yonetimi departmani uzerinden) ekledigi urun/hizmet. Sirket anasayfasinda is kartlariyla ayni gorunumde listelenir.';

create index products_org_idx on public.products(organization_id) where archived_at is null;
create index products_dept_idx on public.products(department_id) where department_id is not null;

alter table public.products enable row level security;
