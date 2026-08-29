-- Restore sonrası gömülü Supabase Storage URL'lerini yeni gateway adresine çevirir.
-- Kullanım:
--   psql -v eski_kok='https://proje.supabase.co' -v yeni_kok='https://api.ornek.com' -f guncelle-storage-url.sql

\if :{?eski_kok}
\else
  \echo 'HATA: eski_kok zorunlu'
  \quit 2
\endif
\if :{?yeni_kok}
\else
  \echo 'HATA: yeni_kok zorunlu'
  \quit 2
\endif

BEGIN;

UPDATE jobs
SET cover_image_url = replace(cover_image_url, :'eski_kok', :'yeni_kok')
WHERE cover_image_url LIKE '%' || :'eski_kok' || '%';

UPDATE organizations
SET cover_image_url = replace(cover_image_url, :'eski_kok', :'yeni_kok')
WHERE cover_image_url LIKE '%' || :'eski_kok' || '%';

UPDATE product_images
SET url = replace(url, :'eski_kok', :'yeni_kok')
WHERE url LIKE '%' || :'eski_kok' || '%';

UPDATE products
SET cover_image_url = replace(cover_image_url, :'eski_kok', :'yeni_kok')
WHERE cover_image_url LIKE '%' || :'eski_kok' || '%';

UPDATE projects
SET cover_image_url = replace(cover_image_url, :'eski_kok', :'yeni_kok')
WHERE cover_image_url LIKE '%' || :'eski_kok' || '%';

UPDATE task_attachments
SET url = replace(url, :'eski_kok', :'yeni_kok')
WHERE url LIKE '%' || :'eski_kok' || '%';

UPDATE users
SET avatar_url = replace(avatar_url, :'eski_kok', :'yeni_kok')
WHERE avatar_url LIKE '%' || :'eski_kok' || '%';

COMMIT;
