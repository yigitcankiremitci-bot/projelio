-- Projelio - Proje kapak fotoğrafı ve depolama bucket'ı

ALTER TABLE projects ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-covers', 'project-covers', true)
ON CONFLICT (id) DO NOTHING;
