-- Projelio - Duvar paylaşımının görünürlüğü: yalnızca arkadaşlar ya da herkes
--
-- 134'te duvar paylaşımını yalnızca duvar sahibi ve arkadaşları görüyordu.
-- Artık yazan kişi paylaşım başına seçiyor: 'herkes' seçilen paylaşım,
-- arkadaş olmayanların Sosyal akışında da görünür, beğenilir, yorumlanır.
--
-- Sütun yalnızca duvar paylaşımlarında anlamlı; proje/departman/şirket
-- akışlarında NULL kalır (görünürlüğü zaten kapsamın kendisi belirliyor).
--
-- MEVCUT duvar paylaşımları 'arkadaslar' olur: "paylaşımları yalnızca
-- arkadaşlar görür" denerek yazıldılar; geriye dönük herkese açmak o sözü
-- bozardı.
--
-- Başkasının duvarına yazılan paylaşım her zaman 'arkadaslar' (bkz.
-- arkadaslik-durumu.ts gorunurlukCoz): duvar sahibi kendi duvarının herkese
-- açılmasına onay vermedi.

ALTER TABLE project_posts
    ADD COLUMN IF NOT EXISTS gorunurluk VARCHAR(12)
        CHECK (gorunurluk IN ('arkadaslar', 'herkes'));

UPDATE project_posts SET gorunurluk = 'arkadaslar'
    WHERE wall_user_id IS NOT NULL AND gorunurluk IS NULL;

-- Duvar paylaşımında görünürlük zorunlu, diğerlerinde yasak.
ALTER TABLE project_posts
    ADD CONSTRAINT project_posts_gorunurluk_duvar
        CHECK ((wall_user_id IS NULL) = (gorunurluk IS NULL));

-- "Herkes" akışı: en yeni herkese açık paylaşımlar.
CREATE INDEX IF NOT EXISTS project_posts_herkese_acik_idx
    ON project_posts(created_at DESC) WHERE gorunurluk = 'herkes';
