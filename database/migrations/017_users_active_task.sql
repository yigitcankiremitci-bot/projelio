-- Projelio - "Üzerinde çalışıyorum": bir kullanıcının o an aktif olarak
-- üzerinde çalıştığı görevi tutar (iş ekibi sekmesinde görünür).

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_users_active_task_id ON users(active_task_id);
