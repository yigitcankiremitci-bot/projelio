-- Projelio - Kullanıcının elle sıralayabilmesi için işler, projeler ve görevlere sort_order kolonu

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_jobs_sort_order ON jobs(owner_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_projects_sort_order ON projects(job_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_sort_order ON tasks(project_id, status, sort_order);

-- Mevcut kayıtlara created_at sırasına göre başlangıç sort_order değeri ver
-- (ilk elle taşımada zaten kendini düzeltiyor, bu sadece makul bir başlangıç).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY owner_id ORDER BY created_at) - 1 AS rn
  FROM jobs
)
UPDATE jobs SET sort_order = ranked.rn FROM ranked WHERE jobs.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY created_at) - 1 AS rn
  FROM projects
)
UPDATE projects SET sort_order = ranked.rn FROM ranked WHERE projects.id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY project_id, status, parent_task_id, output_id ORDER BY created_at) - 1 AS rn
  FROM tasks
)
UPDATE tasks SET sort_order = ranked.rn FROM ranked WHERE tasks.id = ranked.id;
