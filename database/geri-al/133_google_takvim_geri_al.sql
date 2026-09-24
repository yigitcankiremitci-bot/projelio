-- 133_google_takvim.sql'i geri alır. Google tarafındaki etkinliklere dokunmaz;
-- bağlantılar Google hesabında "üçüncü taraf erişimi" olarak kalır, kullanıcı
-- oradan kaldırabilir.

drop table if exists public.google_takvim_etkinlikleri;
drop table if exists public.google_takvim_baglantilari;
