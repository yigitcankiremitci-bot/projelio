-- 089_sirket_duzeyinde_dosyalar.sql
-- Şirketin kendi dosya alanı
--
-- SORUN
-- -----
-- Şirket ekranındaki "Dosyalar" sekmesi SALT OKUNURDU: altındaki işlerin
-- dosyalarını topluyor, ama şirketin kendisine dosya eklenemiyordu. Bir dosyanın
-- ya bir İŞE ya bir DEPARTMANA ait olması zorunluydu (bkz. 032'deki files_scope
-- kısıtı). Yeni şirket kuran kullanıcı için bu, "şirketimi kurdum ama hiçbir
-- yere dosya koyamıyorum" demekti: önce departman açması gerektiğini hiçbir yer
-- söylemiyordu.
--
-- NE DEĞİŞİYOR
-- -----------
-- Dosyanın sahibi artık ÜÇ şeyden biri olabilir: iş, departman ya da şirket.
-- Şirket dosyaları departman dosyalarıyla birebir aynı modeli kullanır: tek,
-- DÜZ klasör (alt klasör yok) + kadroya verilen Drive izinleri. Klasör,
-- şirketin depo hesabındaki şirket adını taşıyan klasördür (bkz. 088).
--
-- `organization_storage` zaten 088'de kuruldu; burada ona bir şey eklenmiyor —
-- o tablo hem "şirket hangi hesabı kullanıyor" seçimini hem şirket klasörünün
-- kimliğini taşıyor.

-- ============================================== 1. files: üçüncü kapsam
alter table public.files
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.files drop constraint if exists files_scope;
alter table public.files
  add constraint files_scope check (num_nonnulls(job_id, department_id, organization_id) = 1);

create index if not exists files_organization_idx
  on public.files(organization_id) where organization_id is not null and archived_at is null;

-- ============================================== 2. file_upload_sessions: aynısı
alter table public.file_upload_sessions
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

alter table public.file_upload_sessions drop constraint if exists file_upload_sessions_scope;
alter table public.file_upload_sessions
  add constraint file_upload_sessions_scope
  check (num_nonnulls(job_id, department_id, organization_id) = 1);

-- ============================================== 3. Drive paylaşım izinleri
-- department_folder_grants ile birebir aynı: şirketin klasörüne erişmesi
-- gereken herkese (sahip + onaylı üyeler) izin verilir, üyelikten çıkanın
-- izni bu kayıt üzerinden geri alınır.

create table if not exists public.organization_folder_grants (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  granted_email         varchar not null,
  drive_file_id         text not null,
  drive_permission_id   text not null,
  role                  varchar not null default 'writer' check (role in ('reader','writer')),
  created_at            timestamp not null default current_timestamp,
  unique (organization_id, user_id)
);

comment on table public.organization_folder_grants is
  'Sirket klasorune verilen bulut izni. Uye cikarildiginda bu kayit uzerinden geri alinir.';

create index if not exists organization_folder_grants_user_idx
  on public.organization_folder_grants(user_id);

alter table public.organization_folder_grants enable row level security;
