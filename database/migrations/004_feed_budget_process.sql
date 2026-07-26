-- Akış / Ekip / Bütçe / Süreç sekmeleri için şema eklentileri

-- Proje akışında herkesin bırakabileceği kısa (140 karakter) paylaşımlar
CREATE TABLE IF NOT EXISTS project_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    body VARCHAR(140) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_posts_project_id ON project_posts(project_id);

ALTER TABLE project_posts ENABLE ROW LEVEL SECURITY;

-- Görev bütçelerinin proje yöneticisi tarafından onaylanabilmesi
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS budget_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (budget_status IN ('pending', 'approved'));

-- Bütçenin hangi ekip üyelerine görünür olacağı ayarı
ALTER TABLE project_members
    ADD COLUMN IF NOT EXISTS can_view_budget BOOLEAN NOT NULL DEFAULT false;
