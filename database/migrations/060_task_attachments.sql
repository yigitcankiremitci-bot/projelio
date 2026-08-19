-- 060_task_attachments.sql
-- Göreve (ve dolayısıyla rutin tekrarlarına) link/dosya eki + kapatılmış
-- rutinlerin arşivi için indeksler.
--
-- SORUN:
--   Bir rutin tekrarı (ör. "17 Ağustos haftalık rapor") tamamlandı işaretlenip
--   geçiyor; ortaya çıkan ÇIKTI hiçbir yerde durmuyor. Kullanıcı yayınladığı
--   gönderinin linkini ya da teslim ettiği dosyayı açıklamaya elle yazıyor,
--   sonraki hafta o bilgi kayboluyor. Geçmişe bakınca yalnızca "yapıldı /
--   yapılmadı" noktaları görünüyor, NE yapıldığı görünmüyor.
--
-- ÇÖZÜM — neden `task_attachments`, `operation_occurrence_attachments` değil:
--   Rutin tekrarları ayrı bir tabloda DEĞİL; `tasks` içinde `operation_id` ve
--   `occurrence_on` dolu satırlar olarak yaşıyorlar (bkz.
--   operations.service.findOccurrences — sorgu doğrudan `tasks`e gidiyor).
--   Dolayısıyla ek, doğal olarak bir GÖREV ekidir. Bunu "tekrar eki" diye
--   adlandırmak aynı satırı iki farklı isimle anmak olurdu; üstelik böylece
--   proje ve departman görevleri de aynı eklerden yararlanır — istenen davranış
--   zaten "proje görevleri gibi çalışsın".
--
-- DOSYALAR BU TABLOYA YAZILMAZ.
--   Dosyanın kendisi kullanıcının Google Drive / OneDrive hesabında yaşar ve
--   files modülü üzerinden göreve bağlanır (bkz. FilesPanel, project_files).
--   Kendi depomuza kopyalamak aynı belgenin iki yerde ayrı ayrı yaşamasına ve
--   hangisinin güncel olduğunun belirsizleşmesine yol açıyordu; ayrıca kullanıcı
--   kendi bulutundaki paylaşım/izin düzenini kaybediyordu.
--
--   Bu tablo yalnızca BAĞLANTI tutar (kind='link'): yayınlanan gönderinin
--   adresi, harici bir pano, bir doküman url'i. `kind`, `file_name` ve
--   `file_size` kolonları şemada bırakıldı — ileride harici bir kaynaktan
--   gelen dosya üstverisini kaydetmek gerekirse tabloyu değiştirmeden
--   kullanılabilirler; bugün yazılmıyorlar.

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  kind text not null check (kind in ('link', 'file')),
  -- Link için hedef adres, dosya için depolamadaki url.
  url text not null,
  -- Kullanıcının verdiği görünen ad; boşsa arayüz url'i ya da dosya adını basar.
  label text,
  file_name text,
  file_size bigint,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp not null default current_timestamp
);

create index if not exists idx_task_attachments_task
  on public.task_attachments(task_id);

-- Depodaki diğer tablolarla aynı kural: RLS açık, politika yok. Uygulama
-- sunucusu service_role ile bağlanıp RLS'i baypas eder; yetki Nest tarafında
-- (görevin projesine/departmanına erişim kontrolü).
alter table public.task_attachments enable row level security;

comment on table public.task_attachments is
  'Goreve baglanan link/dosya ekleri. kind=link|file. Rutin tekrarlari da gorev oldugu icin onlar da bunu kullanir.';

-- ---------------------------------------------------------------------------
-- Kapatılmış / arşivlenmiş rutinlere erişim.
--
-- `operations.archived_at` ve `status='ended'` zaten vardı ama ikisi de
-- indekslenmemişti; arşiv görünümü her açılışta tüm rutinleri tarıyordu.
-- ---------------------------------------------------------------------------
create index if not exists idx_operations_archived
  on public.operations (job_id, archived_at)
  where archived_at is not null;

create index if not exists idx_operations_ended
  on public.operations (job_id, ended_on)
  where status = 'ended';
