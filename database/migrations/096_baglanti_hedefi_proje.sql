-- 096_baglanti_hedefi_proje.sql
-- Bağlantı hedeflerine PROJE eklenir.
--
-- NEDEN AYRI MIGRATION: 095 canlıda uygulandı, dosyası artık dokunulmaz
-- (bkz. deploy/migrate.sh içerik doğrulaması — uygulanmış bir dosya sonradan
-- değişirse "değiştirilmiş" diye raporlanır ve kimse hangi sürümün canlıda
-- olduğunu bilemez).
--
-- NEDEN PROJE DE HEDEF:
--   Kullanıcı bir dosyayı en çok "şu proje" diye bağlamak istiyor; görev,
--   projenin altındaki bir ayrıntı. Proje hedefi olmayınca dosyayı projenin
--   rastgele bir görevine asmak gerekiyordu ve o görev kapandığında dosya
--   kavramsal olarak yanlış yerde kalıyordu.

alter table public.file_links drop constraint if exists file_links_target_kind_check;

alter table public.file_links
  add constraint file_links_target_kind_check
  check (target_kind in ('task', 'user', 'module_record', 'project'));

comment on column public.file_links.target_kind is
  'task | user | module_record | project. Hedef tablolara FK YOK (polimorfik); silinen hedefin satiri artikta kalir.';
