-- 045 GERİ ALMA — takvim planlama katmanını kaldırır
--
-- 045_planning_calendar.sql canlı veritabanında çalıştırılacağı için elde bir
-- geri dönüş yolu olsun diye yazıldı. Migration yalnızca YENİ nesneler
-- oluşturuyor; var olan hiçbir tabloya kolon eklemiyor, hiçbir kısıtı
-- değiştirmiyor. Dolayısıyla bu betik tam bir geri alma sağlar: çalıştırıldıktan
-- sonra veritabanı 045 öncesiyle birebir aynı olur.
--
-- DİKKAT: Bu betik planlama VERİSİNİ DE SİLER — odak alanları, dönem hedefleri,
-- takvim blokları ve ritüel kayıtları geri gelmez. Yalnızca 045 yeni
-- uygulanmışken ve içine gerçek veri girilmemişken güvenle çalıştırılabilir.
--
-- Sıra önemli: önce görünüm, sonra bağımlı tablolar, en sonda bağımsızlar.
-- (plan_targets -> plan_periods ve plan_focus_areas'a; plan_time_blocks ->
-- plan_focus_areas'a bağlı.)

drop view if exists public.v_plan_period_progress;

drop table if exists public.plan_rituals;
drop table if exists public.plan_time_blocks;
drop table if exists public.plan_targets;
drop table if exists public.plan_periods;
drop table if exists public.plan_focus_areas;
drop table if exists public.plan_preferences;
