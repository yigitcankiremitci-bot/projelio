-- 125: Serbest çalışan demosunda (Oliver Hayes, 124) başlangıç rehberi ve ilk tur
-- kendiliğinden açılmasın.
--
-- NEDEN: rehber "örnek işini aç" diyor, ama demo hesabında örnek iş yok —
-- ziyaretçi olmayan bir işe yönlendiriliyordu. Şirket demosunda ilk tur zaten
-- görülmüş işaretli; ikisi aynı davransın. Ziyaretçi isterse "?" menüsünden
-- rehberi ve turları yine açabiliyor.
update users
set tours_seen = array['ilk-adimlar', 'baslangic-rehberi:kendiliginden-acma']
where id = 'ce11f000-0000-4000-8000-000000000001'
  and (tours_seen is null or cardinality(tours_seen) = 0);
