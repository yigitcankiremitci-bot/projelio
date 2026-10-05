-- 145_icerik_analizi geri alma
-- Analiz verisi, ilham panosu ve Lio raporları SİLİNİR. Instagram metrikleri
-- bir sonraki senkronda yeniden çekilebilir; ilham notları ve raporlar ise
-- kullanıcının emeği/bakiyesidir — çalıştırmadan önce yedek al.

drop table if exists public.social_idea_reports;
drop table if exists public.social_inspirations;
drop table if exists public.social_account_media;

alter table public.social_accounts
  drop column if exists insights_synced_at,
  drop column if exists insights_error;
