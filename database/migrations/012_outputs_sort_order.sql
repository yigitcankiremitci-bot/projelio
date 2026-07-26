-- Projelio - Çıktılar için elle sıralama desteği

ALTER TABLE outputs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id ORDER BY created_at) - 1 AS rn
    FROM outputs
)
UPDATE outputs o
SET sort_order = ordered.rn
FROM ordered
WHERE o.id = ordered.id;

CREATE INDEX IF NOT EXISTS idx_outputs_sort_order ON outputs(project_id, sort_order);
