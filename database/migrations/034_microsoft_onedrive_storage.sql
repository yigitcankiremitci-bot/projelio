-- 034_microsoft_onedrive_storage.sql
-- OneDrive: Google Drive'a PARALEL ikinci bulut depolama sağlayıcısı.
--
-- Mantık google_accounts/job_storage/files ile birebir aynı: dosyanın gerçek
-- içeriği OneDrive'da yaşar, Projelio yalnızca metadata + yetki tutar.
--
-- Google'dan tek fark: "Google ile giriş"in Microsoft karşılığı YOK. Kullanıcı
-- zaten var olan bir Projelio hesabından, Ayarlar'dan OneDrive'ı BAĞLAR
-- (Google'daki "connect" modunun birebir aynısı). Bu yüzden microsoft_accounts
-- her zaman var olan bir user_id'ye bağlanır; "login" modu karşılığı yoktur.
--
-- Depolama sahipliği artık İKİ sağlayıcıdan biri olabilir. job_storage,
-- department_storage ve files tablolarına storage_provider + microsoft_account_id
-- eklenip google_account_id NULLABLE yapılır. Tam olarak biri dolu olmalı.

-- ============================================== 1. Microsoft hesabı (OneDrive erişim token'ı)

create table public.microsoft_accounts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,

  -- Microsoft'un kalıcı kullanıcı kimliği (id_token.sub). E-posta değişebilir,
  -- bu değişmez.
  ms_sub             varchar not null unique,
  email              varchar not null,
  picture_url        text,

  -- AES-256-GCM ile şifreli refresh token (bkz. microsoft-token-crypto.util.ts,
  -- MICROSOFT_TOKEN_ENC_KEY). Düz metin ASLA yazılmaz.
  refresh_token_enc  text,
  scopes             text[] not null default '{}',

  -- OneDrive'daki "uygulama klasörü"nün (Files.ReadWrite.AppFolder scope'uyla
  -- erişilen /me/drive/special/approot) item id'si. Google'daki "drive.file ile
  -- oluşturulan Projelio klasörü" ile aynı fikir: uygulama yalnızca kendi
  -- oluşturduğu bu klasörün içini görür, kullanıcının OneDrive'ının geri kalanına
  -- hiç erişemez.
  root_folder_id     text,

  connected_at       timestamp not null default current_timestamp,
  last_refreshed_at  timestamp,
  -- Dolu ise: kullanıcı erişimi iptal etti ya da token kalıcı olarak geçersizleşti.
  -- Yeniden bağlanana kadar OneDrive işlemleri yapılamaz.
  drive_revoked_at   timestamp,
  unique (user_id, ms_sub)
);

comment on table public.microsoft_accounts is
  'Kullanıcının bağladığı Microsoft hesabı: yalnızca OneDrive erişim token''ı (şifreli). google_accounts''un OneDrive karşılığı, giriş kimliği yok.';
comment on column public.microsoft_accounts.ms_sub is
  'Microsoft''un kalıcı kullanıcı kimliği (id_token.sub). Eşleştirme e-posta ile değil bununla yapılır.';
comment on column public.microsoft_accounts.refresh_token_enc is
  'AES-256-GCM şifreli. Boş ise kullanıcı OneDrive bağlantısını henüz tamamlamamıştır.';

create index microsoft_accounts_user_id_idx on public.microsoft_accounts(user_id);

alter table public.microsoft_accounts enable row level security;

-- ============================================== 2. job_storage: sağlayıcı seçimi
-- İşin dosyaları artık Google Drive YA DA OneDrive'da tutulabilir; hangisi
-- olduğu storage_provider'da, ilgili hesap kimliği de eşleşen kolonda durur.

alter table public.job_storage
  add column storage_provider varchar not null default 'google'
    check (storage_provider in ('google', 'microsoft')),
  add column microsoft_account_id uuid references public.microsoft_accounts(id) on delete restrict,
  alter column google_account_id drop not null;

alter table public.job_storage
  add constraint job_storage_provider_account check (
    (storage_provider = 'google'    and google_account_id    is not null and microsoft_account_id is null) or
    (storage_provider = 'microsoft' and microsoft_account_id is not null and google_account_id    is null)
  );

comment on column public.job_storage.storage_provider is
  'İşin dosyalarının hangi bulut sağlayıcısında tutulduğu: google (Drive) ya da microsoft (OneDrive).';

create index job_storage_ms_account_idx on public.job_storage(microsoft_account_id);

-- ============================================== 3. department_storage: sağlayıcı seçimi

alter table public.department_storage
  add column storage_provider varchar not null default 'google'
    check (storage_provider in ('google', 'microsoft')),
  add column microsoft_account_id uuid references public.microsoft_accounts(id) on delete restrict,
  alter column google_account_id drop not null;

alter table public.department_storage
  add constraint department_storage_provider_account check (
    (storage_provider = 'google'    and google_account_id    is not null and microsoft_account_id is null) or
    (storage_provider = 'microsoft' and microsoft_account_id is not null and google_account_id    is null)
  );

create index department_storage_ms_account_idx on public.department_storage(microsoft_account_id);

-- ============================================== 4. files: sağlayıcı seçimi
--
-- drive_file_id / web_view_link / icon_link / md5_checksum kolon adları
-- Google'dan kalma ama sağlayıcıdan bağımsız kullanılıyor: OneDrive item'ları
-- için de aynı alanlar dolduruluyor (yeniden adlandırmak yüzlerce sorguyu
-- etkilerdi, karşılığında hiçbir kazanç yok).

alter table public.files
  add column storage_provider varchar not null default 'google'
    check (storage_provider in ('google', 'microsoft')),
  add column microsoft_account_id uuid references public.microsoft_accounts(id) on delete restrict,
  alter column google_account_id drop not null;

alter table public.files
  add constraint files_provider_account check (
    (storage_provider = 'google'    and google_account_id    is not null and microsoft_account_id is null) or
    (storage_provider = 'microsoft' and microsoft_account_id is not null and google_account_id    is null)
  );

comment on column public.files.storage_provider is
  'Dosyanın gerçek içeriğinin hangi bulut sağlayıcısında olduğu: google (Drive) ya da microsoft (OneDrive).';

-- google_account_id zaten (google_account_id, drive_file_id) ile unique'ti;
-- Postgres unique index'lerde NULL'ları birbirinden farklı sayar, bu yüzden
-- google_account_id'si NULL olan (yani Microsoft) satırlar o kısıta hiç
-- takılmaz. Microsoft satırları için kendi eşleniğini ekliyoruz.
create unique index files_ms_account_drive_file_uniq
  on public.files(microsoft_account_id, drive_file_id) where microsoft_account_id is not null;

create index files_ms_account_idx on public.files(microsoft_account_id);
