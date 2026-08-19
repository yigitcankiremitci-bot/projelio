-- Projeye "Beklemede" ve "Pasif" durumları
--
-- Aktif bir proje her zaman iki uçtan birine gitmek zorundaydı: ya tamamlandı
-- ya arşivlendi. Arada duran iki hâl eksikti:
--   on_hold  (Beklemede) — geçici durdu, geri dönülecek (onay, ödeme, sezon…)
--   passive  (Pasif)     — artık çalışılmıyor ama gözden kaldırılmadı;
--                          arşivden farkı listelerde durmaya devam etmesi
--
-- CHECK kısıtı 001_init_schema.sql içinde sütun tanımıyla birlikte gelmişti,
-- bu yüzden adı Postgres'in verdiği varsayılan: projects_status_check.

ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_status_check
  CHECK (status IN ('active', 'on_hold', 'passive', 'completed', 'archived'));
