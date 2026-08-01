-- Projelio - Anasayfadaki kişi kartı için kullanıcı profil alanları ve avatar bucket'ı

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
-- Kullanıcının kendi profilinde gösterdiği görev/unvan (örn. "Serbest Grafik Tasarımcı").
-- project_members.title (bkz. 013_usernames_and_member_titles.sql) proje bazlı bir
-- ekip üyeliği unvanıdır; bu alan ise kullanıcının genel profilinde sabit kalır.
ALTER TABLE users ADD COLUMN IF NOT EXISTS title VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(280);

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
