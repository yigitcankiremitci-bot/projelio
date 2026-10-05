-- 147_metrik_gecmisi geri alma. Biriken metrik geçmişi SİLİNİR ve geri getirilemez
-- (Instagram geçmiş değer vermiyor) — önce yedek al.

drop table if exists public.social_media_metric_snapshots;
drop table if exists public.social_account_snapshots;
