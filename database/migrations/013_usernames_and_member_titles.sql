-- Projelio - Kullanıcı adı (@handle) sistemi ve ekip üyeliği için serbest metin görev/unvan alanı

-- Kullanıcı adı sütunu (henüz zorunlu/tekil değil, önce mevcut kayıtlar dolduruluyor)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30);

-- Mevcut kullanıcılar için e-postanın @ öncesindeki kısmından otomatik kullanıcı adı türet.
-- Aynı köke sahip birden fazla kullanıcı varsa, her satır için tekil olan sıra numarası
-- sona eklenerek çakışma önlenir.
WITH base AS (
    SELECT
        id,
        regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9_.]', '', 'g') AS handle,
        ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM users
    WHERE username IS NULL
)
UPDATE users u
SET username = CASE
    WHEN base.handle = '' THEN 'kullanici' || base.rn::text
    WHEN NOT EXISTS (
        SELECT 1 FROM users u2 WHERE u2.username = base.handle AND u2.id <> u.id
    ) THEN base.handle
    ELSE base.handle || base.rn::text
END
FROM base
WHERE u.id = base.id;

-- Artık her kullanıcının bir kullanıcı adı olmalı: zorunlu, tekil ve belirli bir formatta
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_format CHECK (username ~ '^[a-z0-9_.]{3,30}$');
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- Ekip üyeliğinde proje yöneticisinin serbest metinle yazacağı görev/unvan
-- (örn. "Elektrik taşeronu", "Grafik tasarımcı"); rol (owner/member/subcontractor)
-- yetkilendirme için ayrı bir alan olarak kalmaya devam ediyor.
ALTER TABLE project_members ADD COLUMN IF NOT EXISTS title VARCHAR(80);
