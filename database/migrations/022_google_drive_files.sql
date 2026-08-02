-- 022_google_drive_files.sql
-- Google ile giriş + Google Drive dosya depolama
--
-- Dosyalar Projelio'nun kendi deposunda değil, kullanıcının Google Drive'ında yaşar.
-- Projelio yalnızca metadata (drive_file_id, ad, tür, boyut) ve yetkiyi tutar.
--
-- Neden böyle:
--   * Depolama maliyeti ve kotası kullanıcıya ait; Supabase Storage şişmez.
--   * Google Dokümanlar/E-Tablolar zaten Drive'da yaşıyor; kopyalamak yerine bağlanıyoruz.
--   * Düzenleme Drive'ın kendi editörüyle yapılır — Projelio editör yazmak zorunda kalmaz.
--
-- Temel kural: bir projenin TÜM dosyaları TEK bir Drive hesabında toplanır
-- (project_storage). Yükleyen kişinin kendi Drive'ına dağıtılsaydı, o kişi ekipten
-- ayrıldığında projenin dosyaları erişilemez hâle gelirdi.

-- ============================================== 1. Google hesabı (kimlik + token)
-- Hem "Google ile giriş" kimliği hem Drive erişim token'ı burada durur; ikisi aynı
-- OAuth istemcisinden geldiği için ayrı tablo tutmak yapay bir ayrım olurdu.
-- Kullanıcı önce sadece giriş izniyle gelir (openid/email/profile), Drive'ı
-- bağladığında aynı kayda drive.file scope'u eklenir (incremental authorization).

create table public.google_accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,

  -- Google'ın kalıcı kullanıcı kimliği. E-posta değişebilir, sub değişmez —
  -- bu yüzden giriş eşleştirmesi e-posta ile değil sub ile yapılır.
  google_sub         varchar not null unique,
  email              varchar not null,
  picture_url        text,

  -- AES-256-GCM ile şifreli refresh token. Düz metin ASLA yazılmaz: bir veritabanı
  -- dökümü sızarsa düz token, tüm kullanıcıların Drive'ına süresiz erişim demektir.
  -- Access token hiç saklanmaz (1 saat ömürlü, bellekte tutulur).
  refresh_token_enc  text,
  scopes             text[] not null default '{}',

  -- Bu hesabın Drive'ındaki "Projelio" kök klasörü
  root_folder_id     text,

  connected_at       timestamp not null default current_timestamp,
  last_refreshed_at  timestamp,
  -- Dolu ise: kullanıcı erişimi iptal etti ya da token kalıcı olarak geçersizleşti
  -- (invalid_grant). Yeniden bağlanana kadar Drive işlemleri yapılamaz.
  drive_revoked_at   timestamp,
  unique (user_id, google_sub)
);

comment on table public.google_accounts is
  'Kullanıcının bağladığı Google hesabı: giriş kimliği + Drive refresh token (şifreli).';
comment on column public.google_accounts.google_sub is
  'Google''ın kalıcı kullanıcı kimliği (id_token.sub). Giriş eşleştirmesi e-posta ile değil bununla yapılır.';
comment on column public.google_accounts.refresh_token_enc is
  'AES-256-GCM şifreli. Boş ise kullanıcı henüz Drive iznini vermemiştir (yalnızca giriş).';

create index google_accounts_user_id_idx on public.google_accounts(user_id);

alter table public.google_accounts enable row level security;

-- Google ile gelen kullanıcının şifresi yoktur. Mevcut kullanıcılar etkilenmez.
alter table public.users alter column password_hash drop not null;

comment on column public.users.password_hash is
  'Yalnızca şifreyle kayıt olanlarda dolu. Google ile gelen kullanıcılarda null olur.';

-- ============================================== 2. Projenin depolama sahibi
-- Projenin dosyalarının hangi Drive hesabında durduğu. Sahip ekipten ayrılırsa
-- devretme akışı bu satırı günceller (ve Drive'da klasör sahipliği aktarılır).

create table public.project_storage (
  project_id            uuid primary key references public.projects(id) on delete cascade,
  google_account_id     uuid not null references public.google_accounts(id) on delete restrict,
  drive_folder_id       text not null,
  folder_web_view_link  text,
  created_at            timestamp not null default current_timestamp
);

comment on table public.project_storage is
  'Projenin dosyaları hangi Drive hesabında ve hangi klasörde tutuluyor. Proje başına tek hesap.';

create index project_storage_account_idx on public.project_storage(google_account_id);

alter table public.project_storage enable row level security;

-- ============================================== 3. Klasör ağacı (Drive ID önbelleği)
-- Drive'da klasör ararken isme göre sorgu atmak hem yavaş hem kırılgandır
-- (kullanıcı Drive'da klasörü yeniden adlandırabilir). Bu yüzden her klasörün
-- Drive ID'si burada saklanır; isim değişse de bağ kopmaz.

create table public.project_folders (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects(id) on delete cascade,
  parent_folder_id  uuid references public.project_folders(id) on delete cascade,
  -- Klasör bir çıktıya ya da göreve karşılık geliyorsa ilgili bağ dolu olur.
  output_id         uuid references public.outputs(id) on delete set null,
  task_id           uuid references public.tasks(id) on delete set null,
  name              varchar not null,
  drive_folder_id   text not null,
  created_at        timestamp not null default current_timestamp,
  -- Aynı çıktı/görev için iki klasör açılamaz (idempotent klasör üretimi)
  unique (project_id, output_id),
  unique (project_id, task_id)
);

create index project_folders_project_idx on public.project_folders(project_id);

alter table public.project_folders enable row level security;

-- ============================================== 4. Drive paylaşım izinleri
-- Üye dosyayı Projelio içinde önizleyebilsin ve Drive editöründe düzenleyebilsin
-- diye, proje kök klasörüne üyenin Google hesabı için izin verilir. İzin klasörden
-- alt dosyalara Drive tarafından miras alınır — dosya başına izin vermeye gerek yok.
--
-- drive_permission_id saklanır çünkü izni geri almak (üye projeden çıkarıldığında)
-- ancak bu kimlikle mümkündür.

create table public.project_folder_grants (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references public.projects(id) on delete cascade,
  user_id               uuid not null references public.users(id) on delete cascade,
  granted_email         varchar not null,
  drive_permission_id   text not null,
  role                  varchar not null default 'writer' check (role in ('reader','writer')),
  created_at            timestamp not null default current_timestamp,
  unique (project_id, user_id)
);

comment on table public.project_folder_grants is
  'Proje kök klasörü üzerinde üyeye verilen Drive izni. Üye çıkarıldığında bu kayıt üzerinden geri alınır.';

create index project_folder_grants_user_idx on public.project_folder_grants(user_id);

alter table public.project_folder_grants enable row level security;

-- ============================================== 5. Dosyalar
-- Dosya içeriği burada değil Drive'da. Bu tablo "hangi dosya nereye ait ve kim
-- yükledi" sorusunu cevaplar; içerik her zaman Drive'dan çekilir.

create table public.files (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references public.projects(id) on delete cascade,
  folder_id          uuid references public.project_folders(id) on delete set null,
  -- Dosya doğrudan projeye, bir göreve ya da bir çıktıya iliştirilebilir.
  task_id            uuid references public.tasks(id) on delete cascade,
  output_id          uuid references public.outputs(id) on delete cascade,
  uploaded_by        uuid not null references public.users(id),
  google_account_id  uuid not null references public.google_accounts(id) on delete restrict,

  name               varchar not null,
  mime_type          varchar not null,
  size_bytes         bigint,
  drive_file_id      text not null,
  web_view_link      text,
  icon_link          text,
  md5_checksum       text,

  -- Google Dokümanlar/E-Tablolar/Sunular gibi yerel Drive formatları. Bunlar
  -- alt=media ile inmez, files.export gerektirir ve boyutları yoktur.
  is_google_doc      boolean not null default false,

  -- pending: yükleme oturumu açıldı, henüz tamamlanmadı
  -- ready:   kullanılabilir
  -- missing: Drive'da bulunamadı (kullanıcı silmiş ya da taşımış olabilir)
  status             varchar not null default 'ready'
                       check (status in ('pending','ready','missing')),
  last_verified_at   timestamp,
  created_at         timestamp not null default current_timestamp,
  archived_at        timestamp,

  -- Aynı Drive dosyası aynı hesapta iki kez kaydedilemez
  unique (google_account_id, drive_file_id),
  -- Bir dosya ya göreve ya çıktıya iliştirilir, ikisine birden değil
  constraint files_single_attachment check (num_nonnulls(task_id, output_id) <= 1)
);

comment on table public.files is
  'Drive''daki dosyanın Projelio kaydı. İçerik burada tutulmaz; yalnızca metadata ve bağlam.';
comment on column public.files.is_google_doc is
  'Google Dokümanlar/E-Tablolar/Sunular. İndirme için alt=media değil files.export kullanılır.';
comment on column public.files.status is
  'missing: Drive''da bulunamadı. Kullanıcı dosyayı Drive üzerinden silmiş olabilir; Projelio bundan anlık haberdar olmaz.';

create index files_project_idx on public.files(project_id) where archived_at is null;
create index files_task_idx    on public.files(task_id)    where task_id   is not null and archived_at is null;
create index files_output_idx  on public.files(output_id)  where output_id is not null and archived_at is null;

alter table public.files enable row level security;

-- ============================================== 6. Yükleme oturumları
-- Büyük dosyalar backend'in belleğinden geçirilmez: tarayıcı, backend'in Drive'dan
-- aldığı "resumable session URI"ye parça parça doğrudan yükler. Bu tablo yarım
-- kalan yüklemeleri takip eder ve temizlenmelerini sağlar.

create table public.file_upload_sessions (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete cascade,
  output_id      uuid references public.outputs(id) on delete cascade,
  user_id        uuid not null references public.users(id) on delete cascade,
  folder_id      uuid references public.project_folders(id) on delete set null,
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

-- ============================================== 7. Temizlik
-- Tamamlanmamış ve süresi dolmuş yükleme oturumları birikmesin.

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

select cron.schedule(
  'purge-stale-upload-sessions',
  '30 3 * * *',
  $$select public.purge_stale_upload_sessions();$$
);
