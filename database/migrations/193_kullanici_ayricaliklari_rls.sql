-- 193: kullanici_ayricaliklari tablosunda RLS (192'de unutuldu).
--
-- Şemanın varsayılan-RED düzeni (migration 062): her tabloda RLS açık,
-- politika yok; sunucu service role ile okur/yazar. 192 uygulandıktan sonra
-- izin denetimi (scripts/db-izin-denetimi.sql) tabloyu "RLS kapalı" diye
-- yakaladı. 192'yi değiştirmek uygulanmış dosyanın özetini bozardı; ayrı
-- migration olarak geliyor.
--
-- IDEMPOTENT.

ALTER TABLE kullanici_ayricaliklari ENABLE ROW LEVEL SECURITY;
