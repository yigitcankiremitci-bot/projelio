-- 148_rakip_ve_hashtag_takibi geri alma. Facebook bağlantıları, rakip ve
-- hashtag geçmişi SİLİNİR (geçmiş geri getirilemez) — önce yedek al.

drop table if exists public.social_hashtag_media;
drop table if exists public.social_hashtag_takipleri;
drop table if exists public.social_competitor_media;
drop table if exists public.social_competitor_snapshots;
drop table if exists public.social_fb_connections;

alter table public.social_inspirations
  drop column if exists rakip_takip,
  drop column if exists rakip_profil,
  drop column if exists rakip_synced_at,
  drop column if exists rakip_hata;
