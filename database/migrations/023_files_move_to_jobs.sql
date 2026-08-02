-- 023_files_move_to_jobs.sql
-- Dosya depolamasını proje düzeyinden İŞ (job) düzeyine taşır.
--
-- Neden:
--   Bir iş altında birden çok proje yaşar ve bunlar aynı müşterinin/işin
--   parçalarıdır. Sözleşme, marka kılavuzu, teknik şartname gibi dosyalar tek bir
--   projeye ait değildir — işe aittir. Depolamayı projeye bağlamak, aynı dosyanın
--   projeler arasında kopyalanmasına ya da hiçbir yere ait olamamasına yol açıyordu.
--
--   Ayrıca iş sahibi, altındaki bütün projelerin dosyalarını tek yerden görmek
--   ister. Depolama iş düzeyindeyse bu bedava gelir; proje düzeyindeyse her proje
--   için ayrı Drive klasörü ve ayrı izin yönetimi gerekirdi.
--
-- Dosya hâlâ bir projeye/göreve/çıktıya İLİŞTİRİLEBİLİR (project_id, task_id,
-- output_id) — ama SAHİBİ her zaman iştir.
--
-- 022'deki tablolar hiç veri almadan değiştirildiği için taşıma yapılmıyor,
-- doğrudan yeniden kuruluyorlar.

drop table if exists public.file_upload_sessions cascade;
drop table if exists public.files                cascade;
drop table if exists public.project_folder_grants cascade;
drop table if exists public.project_folders      cascade;
drop table if exists public.project_storage      cascade;

-- ============================================== 1. İşin depolama sahibi
-- İşin TÜM dosyaları tek bir Drive hesabında toplanır. Her üye kendi Drive'ına
-- yükleseydi, biri ekipten ayrıldığında işin dosyalarının bir kısmı erişilemez
-- hâle gelirdi.

create table public.job_storage (
  job_id                uuid primary key references public.jobs(id) on delete cascade,
  google_account_id     uuid not null references public.google_accounts(id) on delete restrict,
  drive_folder_id       text not null,
  folder_web_view_link  text,
  created_at            timestamp not null default current_timestamp
);

comment on table public.job_storage is
  'Isin dosyalari hangi Drive hesabinda ve hangi klasorde tutuluyor. Is basina tek hesap.';

create index job_storage_account_idx on public.job_storage(google_account_id);
alter table public.job_storage enable row level security;

-- ============================================== 2. Klasör ağacı
-- Drive'da klasörü isimle aramak hem yavaş hem kırılgan (kullanıcı Drive'da
-- yeniden adlandırabilir). Her klasörün Drive ID'si burada saklanır.
--
-- kind, klasörün ağaçtaki rolünü söyler:
--   general -> Projelio/{İş}/Genel      (projeye bağlı olmayan iş dosyaları)
--   project -> Projelio/{İş}/{Proje}
--   task    -> .../Görevler/{Görev}
--   output  -> .../Çıktılar/{Çıktı}

create table public.job_folders (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid not null references public.jobs(id) on delete cascade,
  parent_folder_id  uuid references public.job_folders(id) on delete cascade,
  kind              varchar not null check (kind in ('general','project','task','output')),
  project_id        uuid references public.projects(id)   on delete cascade,
  task_id           uuid references public.tasks(id)      on delete cascade,
  output_id         uuid references public.outputs(id)    on delete cascade,
  name              varchar not null,
  drive_folder_id   text not null,
  created_at        timestamp not null default current_timestamp,

  -- Rolüne uygun bağ dolu olmalı; olmayanlar boş kalmalı.
  constraint job_folders_kind_target check (
    (kind = 'general' and project_id is null and task_id is null and output_id is null) or
    (kind = 'project' and project_id is not null and task_id is null and output_id is null) or
    (kind = 'task'    and task_id    is not null and output_id is null) or
    (kind = 'output'  and output_id  is not null and task_id   is null)
  )
);

-- Aynı hedef için iki klasör açılamaz (idempotent klasör üretimi).
create unique index job_folders_general_uniq on public.job_folders(job_id)             where kind = 'general';
create unique index job_folders_project_uniq on public.job_folders(job_id, project_id) where kind = 'project';
create unique index job_folders_task_uniq    on public.job_folders(task_id)            where kind = 'task';
create unique index job_folders_output_uniq  on public.job_folders(output_id)          where kind = 'output';

create index job_folders_job_idx on public.job_folders(job_id);
alter table public.job_folders enable row level security;

-- ============================================== 3. Drive paylaşım izinleri
-- Üye dosyayı Projelio içinde önizleyebilsin ve Drive editöründe düzenleyebilsin
-- diye, kendi Google hesabına klasör izni verilir. İzin alt klasörlere Drive
-- tarafından miras alınır.
--
-- İzin iki farklı seviyede verilebilir:
--   * İş üyesi  -> işin KÖK klasörüne  (tüm projeleri görür)
--   * Proje üyesi -> yalnızca o projenin klasörüne
-- Böylece bir projeye çağrılan taşeron, işin diğer projelerini göremez.

create table public.job_folder_grants (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references public.jobs(id) on delete cascade,
  -- null ise izin işin kökünde (tüm iş); doluysa yalnızca o proje klasöründe.
  project_id           uuid references public.projects(id) on delete cascade,
  user_id              uuid not null references public.users(id) on delete cascade,
  granted_email        varchar not null,
  drive_file_id        text not null,   -- izin verilen klasörün Drive kimliği
  drive_permission_id  text not null,   -- geri almak için gerekli
  role                 varchar not null default 'writer' check (role in ('reader','writer')),
  created_at           timestamp not null default current_timestamp
);

comment on table public.job_folder_grants is
  'Uyeye verilen Drive izni. project_id bos ise isin tamamina, doluysa yalnizca o projeye.';

-- Kullanıcı başına: iş kökünde en fazla bir izin, her projede en fazla bir izin.
create unique index job_folder_grants_job_uniq
  on public.job_folder_grants(job_id, user_id) where project_id is null;
create unique index job_folder_grants_project_uniq
  on public.job_folder_grants(project_id, user_id) where project_id is not null;

create index job_folder_grants_user_idx on public.job_folder_grants(user_id);
alter table public.job_folder_grants enable row level security;

-- ============================================== 4. Dosyalar
-- Dosya her zaman bir İŞE aittir. project_id/task_id/output_id yalnızca
-- "nereye iliştirildiği" bilgisidir ve boş olabilir.

create table public.files (
  id                 uuid primary key default gen_random_uuid(),
  job_id             uuid not null references public.jobs(id) on delete cascade,
  project_id         uuid references public.projects(id) on delete cascade,
  folder_id          uuid references public.job_folders(id) on delete set null,
  task_id            uuid references public.tasks(id)    on delete cascade,
  output_id          uuid references public.outputs(id)  on delete cascade,
  uploaded_by        uuid not null references public.users(id),
  google_account_id  uuid not null references public.google_accounts(id) on delete restrict,

  name               varchar not null,
  mime_type          varchar not null,
  size_bytes         bigint,
  drive_file_id      text not null,
  web_view_link      text,
  icon_link          text,
  md5_checksum       text,
  is_google_doc      boolean not null default false,

  status             varchar not null default 'ready'
                       check (status in ('pending','ready','missing')),
  last_verified_at   timestamp,
  created_at         timestamp not null default current_timestamp,
  archived_at        timestamp,

  unique (google_account_id, drive_file_id),
  constraint files_single_attachment check (num_nonnulls(task_id, output_id) <= 1)
);

comment on table public.files is
  'Drive''daki dosyanin Projelio kaydi. Dosya ISE aittir; proje/gorev/cikti yalnizca ilistirme baglamidir.';
comment on column public.files.project_id is
  'Bos ise dosya isin geneline aittir ve yalnizca is sahibi/uyeleri gorur.';
comment on column public.files.is_google_doc is
  'Google Dokumanlar/E-Tablolar/Sunular. Indirme icin alt=media degil files.export kullanilir.';

create index files_job_idx     on public.files(job_id)     where archived_at is null;
create index files_project_idx on public.files(project_id) where project_id is not null and archived_at is null;
create index files_task_idx    on public.files(task_id)    where task_id    is not null and archived_at is null;
create index files_output_idx  on public.files(output_id)  where output_id  is not null and archived_at is null;

alter table public.files enable row level security;

-- ============================================== 5. Yükleme oturumları

create table public.file_upload_sessions (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid not null references public.jobs(id) on delete cascade,
  project_id     uuid references public.projects(id) on delete cascade,
  task_id        uuid references public.tasks(id)    on delete cascade,
  output_id      uuid references public.outputs(id)  on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  folder_id      uuid references public.job_folders(id) on delete set null,
  resumable_uri  text not null,
  name           varchar not null,
  mime_type      varchar not null,
  size_bytes     bigint,
  expires_at     timestamp not null default (current_timestamp + interval '24 hours'),
  completed_at   timestamp,
  created_at     timestamp not null default current_timestamp
);

create index file_upload_sessions_open_idx
  on public.file_upload_sessions(expires_at) where completed_at is null;

alter table public.file_upload_sessions enable row level security;

-- ============================================== 6. Temizlik
-- 022'de oluşturulan fonksiyon tabloyla birlikte düşmedi ama gövdesi hâlâ
-- geçerli; yine de açıkça yeniden tanımlayalım ki bağımlılık net olsun.

create or replace function public.purge_stale_upload_sessions()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare removed integer;
begin
  delete from public.file_upload_sessions
   where completed_at is null and expires_at < current_timestamp;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.purge_stale_upload_sessions() from public, anon, authenticated;
grant  execute on function public.purge_stale_upload_sessions() to service_role;
