-- 090_klasorler_ve_onizleme.sql
-- Kullanıcı klasörleri (her kapsamda) + dosya önizlemesi
--
-- NE VARDI
-- --------
-- `job_folders` gerçek bir klasör AĞACI tutuyordu (parent_folder_id) ve her dosya
-- `files.folder_id` ile ona bağlıydı. Ama iki sınırı vardı:
--   1. Yalnızca İŞ kapsamında çalışıyordu; departman ve şirket dosyaları tek düz
--      klasöre yığılıyordu.
--   2. Klasörler yalnızca Projelio'nun kendi ürettikleriydi (Proje/Görev/Çıktı).
--      Kullanıcı kendi klasörünü açamıyor, klasör yükleyemiyordu.
-- Üstelik bu ağaç bulutta gerçekten VAR ama arayüz hiç göstermiyordu: kullanıcı
-- Drive'da klasörleri görüyor, Projelio'da düz liste görüyordu.
--
-- NE DEĞİŞİYOR
-- -----------
--   1. Tablo `file_folders` oldu: artık yalnızca işlere ait değil (job_id,
--      department_id, organization_id'den tam biri dolu — files ile aynı desen).
--   2. Yeni tür `kind='user'`: kullanıcının açtığı ya da klasör yükleyerek
--      oluşan klasör. Projelio'nun ürettiklerinden (general/project/task/output)
--      AYRI tutuluyor, çünkü onlar silinemez/yeniden adlandırılamaz — kaynağı
--      projenin adı, klasörün kendisi değil.
--   3. `files.thumbnail_link`: sağlayıcının ürettiği önizleme adresi.
--
-- ÖNİZLEME NEDEN KOLONDA DURUYOR
-- ------------------------------
-- Drive'ın thumbnailLink'i KISA ÖMÜRLÜ ve kimlik ister; tarayıcıya doğrudan
-- verilemez (<img src> çalışmaz, ayrıca jetonu sızdırırdı). Adres burada
-- saklanıp içerik mevcut imzalı proxy üzerinden servis ediliyor
-- (bkz. GET /files/:id/content). Kolon bir önbellek: boşsa önizleme yok sayılır.

-- ============================================== 1. Tablo artık işe özel değil
alter table public.job_folders rename to file_folders;

alter table public.file_folders
  add column if not exists department_id   uuid references public.departments(id)   on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  alter column job_id drop not null;

alter table public.file_folders
  add constraint file_folders_scope
  check (num_nonnulls(job_id, department_id, organization_id) = 1);

-- kind: 'user' eklendi. Eski kısıt adı tablo adıyla birlikte taşınmadığı için
-- düşürülüp yeniden kuruluyor.
alter table public.file_folders drop constraint if exists job_folders_kind_target;
alter table public.file_folders
  add constraint file_folders_kind_target check (
    (kind = 'general' and project_id is null and task_id is null and output_id is null) or
    (kind = 'user'    and project_id is null and task_id is null and output_id is null) or
    (kind = 'project' and project_id is not null and task_id is null and output_id is null) or
    (kind = 'task'    and task_id    is not null and output_id is null) or
    (kind = 'output'  and output_id  is not null and task_id   is null)
  );

alter table public.file_folders drop constraint if exists job_folders_kind_check;

-- kind kontrolü kolon üzerinde tanımlıydı; 'user' onu da genişletmeli.
do $$
declare
  ad text;
begin
  select conname into ad
  from pg_constraint
  where conrelid = 'public.file_folders'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%kind%'
    and pg_get_constraintdef(oid) like '%general%'
    and conname <> 'file_folders_kind_target';
  if ad is not null then
    execute format('alter table public.file_folders drop constraint %I', ad);
  end if;
end $$;

alter table public.file_folders
  add constraint file_folders_kind
  check (kind in ('general', 'user', 'project', 'task', 'output'));

comment on table public.file_folders is
  'Dosya klasoru agaci. Projelio uretimi (general/project/task/output) ya da kullanicinin actigi (user). Kapsam: is, departman ya da sirket.';
comment on column public.file_folders.kind is
  'user = kullanicinin actigi/yukledigi klasor; digerleri Projelio uretimi ve elle silinemez.';

-- Eski tekillik indeksleri job_id'ye dayanıyordu; adları da tabloyla uyumsuz kaldı.
drop index if exists job_folders_general_uniq;
create unique index if not exists file_folders_general_uniq on public.file_folders(job_id) where kind = 'general';

-- Aynı ebeveynde aynı adda iki kullanıcı klasörü olmasın: klasör yüklemesi
-- (aynı ağacı ikinci kez yüklemek) aksi halde her seferinde kopya üretirdi.
-- Kök (parent_folder_id null) için ayrı indeks; NULL'lar unique'te eşleşmiyor.
create unique index if not exists file_folders_user_uniq
  on public.file_folders(coalesce(job_id, department_id, organization_id), parent_folder_id, lower(name))
  where kind = 'user' and parent_folder_id is not null;
create unique index if not exists file_folders_user_root_uniq
  on public.file_folders(coalesce(job_id, department_id, organization_id), lower(name))
  where kind = 'user' and parent_folder_id is null;

create index if not exists file_folders_department_idx
  on public.file_folders(department_id) where department_id is not null;
create index if not exists file_folders_organization_idx
  on public.file_folders(organization_id) where organization_id is not null;
create index if not exists file_folders_parent_idx
  on public.file_folders(parent_folder_id) where parent_folder_id is not null;

-- ============================================== 2. Dağıtım penceresi için uyumluluk
-- Migration'lar koddan ÖNCE elle uygulanıyor (bkz. CLAUDE.md). Tablo adı
-- değiştiği anda canlıdaki ESKİ kod `job_folders`'ı sorgulamaya devam eder ve
-- iş dosyası yüklemeleri 500 döner — CI + dağıtım zamanlayıcısı kadar sürecek,
-- gerçek ve görünür bir kesinti.
--
-- Basit (tek tablo, süzgeçsiz) bir görünüm PostgreSQL'de kendiliğinden
-- güncellenebilir: eski kod okumaya ve yazmaya devam edebilir. Yeni kod
-- yayıldıktan sonra bir sonraki migration'da düşürülmeli.
create or replace view public.job_folders as select * from public.file_folders;

comment on view public.job_folders is
  'GECICI uyumluluk gorunumu: file_folders yeni adi. Yeni kod yayildiktan sonra dusurulecek.';

-- ============================================== 3. Önizleme adresi
alter table public.files
  add column if not exists thumbnail_link text;

comment on column public.files.thumbnail_link is
  'Saglayicinin urettigi onizleme adresi. Kisa omurlu ve kimlik ister; icerik imzali proxy uzerinden servis edilir.';
