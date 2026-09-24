-- Projelio - Arkadaşlık + kişisel duvar
--
-- Arkadaşlık iş/şirket ilişkisinden BAĞIMSIZ: aynı işte, aynı şirkette
-- olmayan iki kullanıcı da arkadaş olabilir. Bu yüzden kadro/üyelik
-- tablolarının hiçbirine bağlanmıyor, kendi tablosunu taşıyor.
--
-- TEK SATIR = TEK ÇİFT: A→B isteği ile B→A isteği aynı ilişkidir. Tekil indeks
-- sırasız çift (least/greatest) üzerinde, yani iki taraf aynı anda istek
-- gönderse bile ikinci satır veritabanı düzeyinde reddedilir.
--
-- 'reddedildi' satırı SİLİNMEZ: silinseydi isteyen kişi reddedildiğini anlayıp
-- sınırsız yeniden gönderebilir, karşı tarafa bildirim yağdırabilirdi.
-- İsteyene bu satır hâlâ "istek gönderildi" olarak görünür (bkz.
-- arkadaslik-durumu.ts). Reddeden taraf sonradan fikir değiştirirse kendisi
-- istek gönderebilir; o zaman aynı satır yön değiştirip yeniden 'bekliyor' olur.

CREATE TABLE IF NOT EXISTS arkadasliklar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    isteyen_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    alan_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    durum VARCHAR(12) NOT NULL DEFAULT 'bekliyor'
        CHECK (durum IN ('bekliyor', 'kabul', 'reddedildi')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    yanitlandi_at TIMESTAMP,
    CONSTRAINT arkadasliklar_kendisi_degil CHECK (isteyen_id <> alan_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS arkadasliklar_cift_uniq
    ON arkadasliklar (LEAST(isteyen_id, alan_id), GREATEST(isteyen_id, alan_id));
CREATE INDEX IF NOT EXISTS idx_arkadasliklar_isteyen ON arkadasliklar(isteyen_id, durum);
CREATE INDEX IF NOT EXISTS idx_arkadasliklar_alan ON arkadasliklar(alan_id, durum);

ALTER TABLE arkadasliklar ENABLE ROW LEVEL SECURITY;

-- Kişisel duvar: paylaşım bir kullanıcının duvarına yazılır (kendi duvarı ya
-- da bir arkadaşının). Ayrı bir tablo açılmadı — project_posts zaten
-- polimorfik (021, 031, 033) ve beğeni/yorum/yorum beğenisi tabloları ona
-- bağlı; yeni kapsam bunların hepsini bedavaya alıyor.
ALTER TABLE project_posts
    ADD COLUMN IF NOT EXISTS wall_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE project_posts
    DROP CONSTRAINT project_posts_single_parent,
    ADD CONSTRAINT project_posts_single_parent
        CHECK (num_nonnulls(project_id, operation_id, department_id, organization_id, wall_user_id) = 1);

CREATE INDEX IF NOT EXISTS project_posts_wall_user_id_idx
    ON project_posts(wall_user_id) WHERE wall_user_id IS NOT NULL;
