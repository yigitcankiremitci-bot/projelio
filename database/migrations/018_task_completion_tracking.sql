-- Görev tamamlandığında ne zaman ve kim tarafından tamamlandığını izlemek için.
-- "Bugün yapılanlar" gibi ekip aktivite özetlerinde kullanılır.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_completed_by ON tasks(completed_by);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at);
