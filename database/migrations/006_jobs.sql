-- Projelio - İş (Job) üst kademesi: bir iş birçok projeyi barındırır

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_owner_id ON jobs(owner_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE CASCADE;

-- Mevcut projeleri sahiplerine ait "Genel" adında varsayılan bir işe bağla
INSERT INTO jobs (owner_id, title)
SELECT DISTINCT owner_id, 'Genel'
FROM projects
WHERE owner_id IS NOT NULL AND job_id IS NULL;

UPDATE projects p
SET job_id = j.id
FROM jobs j
WHERE p.job_id IS NULL AND j.owner_id = p.owner_id AND j.title = 'Genel';

ALTER TABLE projects ALTER COLUMN job_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_job_id ON projects(job_id);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
