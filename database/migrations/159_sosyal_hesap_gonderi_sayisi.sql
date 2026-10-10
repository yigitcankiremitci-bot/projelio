-- 159_sosyal_hesap_gonderi_sayisi.sql
-- Bağlı hesabın platformdaki GERÇEK gönderi sayısı.
--
-- NEDEN: Hesaplar listesindeki "{n} içerik" yalnızca Projelio'da planlanmış
-- gönderileri sayıyordu; yüzlerce gönderisi olan bağlı bir Instagram hesabı
-- "0 içerik" görünüyordu (kullanıcı geri bildirimi, 2026-10-10). Sayı her
-- senkronda Instagram'ın `media_count` alanından yazılır (bkz.
-- InstagramInsightsService.profiliTazele).
--
-- Elle yönetilen hesaplarda boş kalır; arayüz o zaman Projelio'daki sayıya düşer.

alter table public.social_accounts
  add column if not exists media_count integer;

comment on column public.social_accounts.media_count is
  'Bagli hesabin platformdaki gonderi sayisi (senkronla yazilir). Elle yonetilen hesapta bos.';
