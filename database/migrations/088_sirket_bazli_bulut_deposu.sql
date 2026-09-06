-- 088_sirket_bazli_bulut_deposu.sql
-- Şirket başına ayrı Drive/OneDrive hesabı
--
-- SORUN
-- -----
-- Bugüne kadar bir Projelio kullanıcısına YALNIZCA TEK Google ve TEK Microsoft
-- hesabı bağlanabiliyordu (kod `findByUserId(...).maybeSingle()` ile okuyordu,
-- ikinci hesap bağlamak ConflictException'la reddediliyordu). Serbest çalışan
-- olarak başlayıp sonra şirket kuran kullanıcı, şirketin dosyalarını kendi
-- kişisel Drive'ından ayıramıyordu: iki dünyanın dosyaları aynı hesapta
-- karışıyordu.
--
-- Ayrıca depo hesabı kullanıcıya hiç SORULMUYORDU: ilk dosya yüklenirken
-- "organizasyon sahibinin hesabı, yoksa yükleyenin hesabı" diye sessizce
-- seçiliyor ve `job_storage`/`department_storage` satırına yazılıp bir daha
-- değişmiyordu.
--
-- NE DEĞİŞİYOR
-- -----------
--   1. Bulut hesapları çoğullaşıyor: bir kullanıcı birden fazla Drive/OneDrive
--      hesabı bağlayabilir. Hangisinin GİRİŞ kimliği olduğu artık açıkça
--      işaretli (`is_login_identity`) — ek olarak bağlanan bir depo hesabıyla
--      Projelio'ya giriş YAPILAMAZ. Bu ayrım güvenlik gereği: aksi hâlde
--      "şirketin deposu" diye bağlanan her hesap sessizce bir giriş yolu açardı.
--   2. `organization_storage`: şirketin dosyalarının hangi sağlayıcıda, hangi
--      hesapta durduğu. `department_storage` ile aynı desen, iki sağlayıcıyı da
--      baştan taşıyor. Şirketin departmanları ve işleri bu seçimi devralır;
--      satır yoksa eski davranış (sahibin varsayılan hesabı) aynen sürer.
--
-- Bu migration TEK BAŞINA hiçbir davranışı değiştirmez: yeni kolonların
-- varsayılanları bugünkü durumu tarif eder (`is_login_identity = true`), yeni
-- tablo da boş başlar.

-- ============================================== 1. Bulut hesapları çoğullaşıyor
-- google_sub / ms_sub global unique KALIYOR: bir bulut hesabı en fazla bir
-- Projelio kullanıcısına ait olabilir. Kalkan yalnızca "kullanıcı başına tek
-- satır" varsayımı.

alter table public.google_accounts
  add column if not exists label varchar,
  add column if not exists is_login_identity boolean not null default true;

comment on column public.google_accounts.label is
  'Kullanicinin verdigi ad (ornek: "Sirket Drive"). Birden fazla hesap bagliyken ayirt etmek icin.';
comment on column public.google_accounts.is_login_identity is
  'Bu hesapla Google ile giris yapilabilir mi. Yalnizca depo icin eklenen ikinci hesaplarda false.';

alter table public.microsoft_accounts
  add column if not exists label varchar,
  add column if not exists is_login_identity boolean not null default true;

comment on column public.microsoft_accounts.label is
  'Kullanicinin verdigi ad (ornek: "Sirket OneDrive").';
comment on column public.microsoft_accounts.is_login_identity is
  'Bu hesapla Microsoft ile giris yapilabilir mi. Yalnizca depo/posta icin eklenen ikinci hesaplarda false.';

-- Giris kimligi kullanici basina EN FAZLA BİR tane olabilir. Kismi unique index
-- bunu veritabani seviyesinde garantiler: kod tarafindaki kontrol atlansa bile
-- ikinci bir giris kimligi yazilamaz.
create unique index if not exists google_accounts_login_identity_uniq
  on public.google_accounts(user_id) where is_login_identity;
create unique index if not exists microsoft_accounts_login_identity_uniq
  on public.microsoft_accounts(user_id) where is_login_identity;

-- ============================================== 2. Şirketin depo hesabı
-- department_storage/job_storage ile aynı desen. Farkı: bu satır dosya
-- yüklenmeden ÖNCE de var olabilir — kullanıcı şirketi kurarken "bu şirket şu
-- hesabı kullansın" diyebilsin diye. Bu yüzden drive_folder_id NULL olabilir:
-- klasör ilk dosyada açılır.

create table if not exists public.organization_storage (
  organization_id       uuid primary key references public.organizations(id) on delete cascade,

  storage_provider      varchar not null default 'google'
                          check (storage_provider in ('google', 'microsoft')),
  google_account_id     uuid references public.google_accounts(id) on delete restrict,
  microsoft_account_id  uuid references public.microsoft_accounts(id) on delete restrict,

  -- Sirketin kok klasoru. Secim yapildiginda NULL olur, ilk kullanimda dolar.
  drive_folder_id       text,
  folder_web_view_link  text,

  -- Secimi kim yapti: "neden benim Drive'ima yaziyor" sorusunun cevabi.
  set_by                uuid references public.users(id) on delete set null,
  created_at            timestamp not null default current_timestamp,
  updated_at            timestamp,

  constraint organization_storage_provider_account check (
    (storage_provider = 'google'    and google_account_id    is not null and microsoft_account_id is null) or
    (storage_provider = 'microsoft' and microsoft_account_id is not null and google_account_id    is null)
  )
);

comment on table public.organization_storage is
  'Sirketin dosyalari hangi bulut hesabinda tutuluyor. Departmanlari ve isleri bu secimi devralir; satir yoksa sahibin varsayilan hesabi kullanilir.';
comment on column public.organization_storage.drive_folder_id is
  'Sirketin kok klasoru. Secim yapildiginda bos olabilir; ilk dosyada acilir.';

create index if not exists organization_storage_google_idx
  on public.organization_storage(google_account_id) where google_account_id is not null;
create index if not exists organization_storage_ms_idx
  on public.organization_storage(microsoft_account_id) where microsoft_account_id is not null;

alter table public.organization_storage enable row level security;
