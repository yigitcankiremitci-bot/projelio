-- 051_task_module_source.sql
-- Modül kaydı ile görev arasındaki köprü.
--
-- SORUN:
--   Bir sosyal medya planı, bir tedarik talebi ya da bir kalite uygunsuzluğu
--   girildiğinde iş orada bitmiyor: birinin o işi yapması gerekiyor. Bugün
--   kullanıcı modülde kaydı giriyor, sonra departman görevlerine gidip aynı
--   şeyi elle bir kez daha yazıyor. İki kayıt arasında hiçbir bağ yok; görev
--   tamamlandığında modüldeki kayıt bunu bilmiyor, modüldeki kayıt
--   değiştiğinde görev bayat kalıyor.
--
-- ÇÖZÜM:
--   Görev, hangi modül kaydından doğduğunu taşısın. Tek yönlü ve gevşek bir
--   bağ: görev silinse modül kaydı, modül kaydı arşivlense görev etkilenmez.
--   Bu sayede modül panelinde "bu kayıttan 2 görev üretilmiş" denebiliyor ve
--   aynı kayıt için ikinci kez görev açılırken kullanıcı uyarılabiliyor.
--
-- Neden yeni tablo değil: bağ görevin bir NİTELİĞİ (nereden geldi), ayrı bir
-- varlık değil. Ara tablo, iki satırlık bir bilgiyi üç tabloya yayardı.
--
-- Bkz. docs/moduller/24-yerlesim-modul-yuzeyleri.md §2.7

alter table public.tasks
  add column if not exists source_module_key varchar,
  add column if not exists source_record_id  uuid;

comment on column public.tasks.source_module_key is
  'Gorev bir modul kaydindan uretildiyse o modulun katalog anahtari.';
comment on column public.tasks.source_record_id is
  'Gorevi doguran module_records kaydinin id si. Kayit arsivlense bile gorev yasar.';

-- "Bu kayıttan hangi görevler doğdu" sorgusu her modül panelinde çalışacak.
create index if not exists tasks_source_record_idx
  on public.tasks(source_record_id)
  where source_record_id is not null;
