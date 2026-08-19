-- 060_occurrence_attachments.sql
-- Rutin tekrarlarına link/dosya eki + kapatılmış rutinlerin arşivi.
--
-- SORUN:
--   Bir rutin tekrarı (ör. "17 Ağustos haftalık rapor") tamamlandı işaretlenip
--   geçiyor; ortaya çıkan ÇIKTI hiçbir yerde durmuyor. Kullanıcı yayınladığı
--   gönderinin linkini ya da teslim ettiği dosyayı görevin açıklamasına elle
--   yazıyor, sonraki hafta o bilgi kayboluyor. Geçmişe bakınca yalnızca
--   "yapıldı/yapılmadı" noktaları görünüyor, ne yapıldığı görünmüyor.
--
-- ÇÖZÜM:
--   Ekler tekrarın kendisine bağlanır (kurala değil): her tekrarın kendi çıktısı
--   var. Kurala bağlanan bir ek "şablon" olurdu — ayrı bir ihtiyaç, karıştırmamak
--   için buraya alınmadı.
--
--   Tek tablo iki türü taşır (`kind`): 'link' yalnızca url tutar, 'file' ek olarak
--   dosya adı ve boyutunu. Ayrı tablolar açmak, listeleme ve silme mantığını
--   sebepsizce ikiye bölerdi.
--
-- NOT (dosya depolama): dosya, kapak görselleriyle aynı Supabase Storage
--   kovasına yazılır ve PUBLIC url üretir — mevcut kapak akışıyla aynı davranış.
--   Ek gizli belge taşıyacaksa imzalı url'e geçilmesi gerekir; o değişiklik
--   yalnızca servisteki url üretimini etkiler, bu şema aynı kalır.

create table if not exists public.operation_occurrence_attachments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null references public.operation_occurrences(id) on delete cascade,
  kind text not null check (kind in ('link', 'file')),
  -- Link için hedef adres, dosya için depolamadaki public url.
  url text not null,
  -- Kullanıcının verdiği görünen ad; boşsa arayüz url'i ya da dosya adını basar.
  label text,
  file_name text,
  file_size bigint,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamp not null default current_timestamp
);

create index if not exists idx_occurrence_attachments_occurrence
  on public.operation_occurrence_attachments(occurrence_id);

-- Depodaki diğer tablolarla aynı kural: RLS açık, politika yok. Uygulama
-- sunucusu service_role ile bağlanıp RLS'i baypas eder; yetki Nest tarafında
-- (assertCanManage → rutinin sahibi/iş sahibi).
alter table public.operation_occurrence_attachments enable row level security;

comment on table public.operation_occurrence_attachments is
  'Rutin tekrarina baglanan link/dosya ekleri. kind=link|file.';

-- ---------------------------------------------------------------------------
-- Kapatılmış rutinlerin arşivi.
--
-- `operations.archived_at` zaten vardı (bkz. operations.service archive/restore)
-- ama "kapat" (status='ended') ile "arşivle" birbirinden ayrıydı ve kapatılan
-- rutin listede aktiflerin arasında durmaya devam ediyordu. Arşiv görünümünün
-- hızlı olabilmesi için kısmi indeks.
-- ---------------------------------------------------------------------------
create index if not exists idx_operations_archived
  on public.operations (job_id, archived_at)
  where archived_at is not null;

create index if not exists idx_operations_ended
  on public.operations (job_id, ended_on)
  where status = 'ended';
