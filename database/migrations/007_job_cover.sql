-- Projelio - İş kapak fotoğrafı ve depolama bucket'ı

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-covers', 'job-covers', true)
ON CONFLICT (id) DO NOTHING;
