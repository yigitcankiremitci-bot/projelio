-- 141_sosyal_yayin_kova_siniri.sql
-- Instagram yayın kovasına (social-publish) kendi boyut sınırı: 300 MB.
--
-- NEDEN: kovanın sınırı yoktu, yani depolama servisinin genel tavanı
-- (FILE_SIZE_LIMIT, 50 MB) geçerliydi. Reels videoları çoğu zaman bunun
-- üstünde; 59 MB'lık bir reels "The object exceeded the maximum allowed size"
-- ile yayımlanamadı. Genel tavan 300 MB'a çıkarıldı (docker-compose.prod.yml);
-- bu satır o gevşemenin YALNIZCA bu kovaya ait olduğunu veritabanında da
-- yazıyor. Görsel kovaları kendi 8 MB sınırlarında kalıyor (bkz. 063).
--
-- 300 MB = Instagram'ın reels için kabul ettiği en büyük dosya.

update storage.buckets
   set file_size_limit = 300 * 1024 * 1024
 where id = 'social-publish';
