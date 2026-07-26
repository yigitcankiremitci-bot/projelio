-- Projelio - Çıktılar (Output): projelerin verdiği çıktılar, görevlerin üstündeki hiyerarşi

CREATE TABLE IF NOT EXISTS outputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outputs_project_id ON outputs(project_id);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS output_id UUID REFERENCES outputs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_output_id ON tasks(output_id);

-- Mevcut üst seviye görevleri, projelerine ait varsayılan "Genel" çıktısına bağla
INSERT INTO outputs (project_id, title)
SELECT DISTINCT project_id, 'Genel'
FROM tasks
WHERE project_id IS NOT NULL AND parent_task_id IS NULL AND output_id IS NULL;

UPDATE tasks t
SET output_id = o.id
FROM outputs o
WHERE t.output_id IS NULL AND t.parent_task_id IS NULL AND o.project_id = t.project_id AND o.title = 'Genel';

ALTER TABLE outputs ENABLE ROW LEVEL SECURITY;
