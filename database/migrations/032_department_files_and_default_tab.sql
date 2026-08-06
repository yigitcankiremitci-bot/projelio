-- 032_department_files_and_default_tab.sql
-- Departman sayfası: açılış sekmesi tercihi + departmana özel Drive dosya deposu.
--
-- "Dosyalar" sekmesi projelerdeki gibi bir İŞ'in Drive klasörüne bağlı olamaz —
-- departmanların bağlı olduğu bir iş yok. Bunun yerine her departman için
-- organizasyonun Drive'ında AYRI, DÜZ (alt klasörsüz) bir klasör açılır; mevcut
-- files/file_upload_sessions tabloları job_id YERİNE department_id de taşıyabilecek
-- şekilde genişletilir (ikisinden tam olarak biri dolu olmalı).

-- ============================================== 1. Açılış sekmesi tercihi
alter table public.departments
  add column if not exists default_tab varchar not null default 'tasks'
    check (default_tab in ('flow','team','tasks','budget','modules','files'));

comment on column public.departments.default_tab is
  'Departman sayfası açıldığında öntanımlı gelecek sekme. Organizasyon sahibi departman ayarlarından değiştirebilir.';

-- ============================================== 2. Departmanın depolama sahibi
-- İş modelindeki job_storage ile birebir aynı mantık: departmanın TÜM dosyaları
-- tek bir Drive hesabında toplanır (organizasyon sahibinin hesabı, bağlı değilse
-- işlemi yapan kullanıcının hesabı).

create table public.department_storage (
  department_id         uuid primary key references public.departments(id) on delete cascade,
  google_account_id     uuid not null references public.google_accounts(id) on delete restrict,
  drive_folder_id       text not null,
  folder_web_view_link  text,
  created_at            timestamp not null default current_timestamp
);

comment on table public.department_storage is
  'Departmanın dosyaları hangi Drive hesabında ve hangi klasörde tutuluyor. Departman başına tek, düz klasör (proje/görev alt klasörü yok).';

create index department_storage_account_idx on public.department_storage(google_account_id);
alter table public.department_storage enable row level security;

-- ============================================== 3. Drive paylaşım izinleri
-- job_folder_grants ile aynı mantık ama tek seviyeli: departmanın onaylı her kadro
-- üyesine (+ organizasyon sahibine) klasörün tamamına izin verilir.

create table public.department_folder_grants (
  id                    uuid primary key default gen_random_uuid(),
  department_id         uuid not null references public.departments(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  granted_email         varchar not null,
  drive_file_id         text not null,
  drive_permission_id   text not null,
  role                  varchar not null default 'writer' check (role in ('reader','writer')),
  created_at            timestamp not null default current_timestamp,
  unique (department_id, user_id)
);

comment on table public.department_folder_grants is
  'Kadro üyesine verilen Drive izni. Üye kadrodan çıkarıldığında bu kayıt üzerinden geri alınır.';

create index department_folder_grants_user_idx on public.department_folder_grants(user_id);
alter table public.department_folder_grants enable row level security;

-- ============================================== 4. files/file_upload_sessions genişletmesi
-- Bir dosya ya bir İŞE ya bir DEPARTMANA aittir, ikisine birden değil.

alter table public.files add column if not exists department_id uuid references public.departments(id) on delete cascade;
alter table public.files alter column job_id drop not null;
alter table public.files
  add constraint files_scope check (num_nonnulls(job_id, department_id) = 1);

create index files_department_idx on public.files(department_id) where department_id is not null and archived_at is null;

alter table public.file_upload_sessions add column if not exists department_id uuid references public.departments(id) on delete cascade;
alter table public.file_upload_sessions alter column job_id drop not null;
alter table public.file_upload_sessions
  add constraint file_upload_sessions_scope check (num_nonnulls(job_id, department_id) = 1);
