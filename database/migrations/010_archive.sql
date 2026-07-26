-- Projelio - Arşivleme: silmek yerine arşive taşıma + geri getirme desteği

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
ALTER TABLE outputs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_jobs_archived_at ON jobs(archived_at);
CREATE INDEX IF NOT EXISTS idx_projects_archived_at ON projects(archived_at);
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);
CREATE INDEX IF NOT EXISTS idx_outputs_archived_at ON outputs(archived_at);
