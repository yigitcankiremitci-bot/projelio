-- Projelio - İşe alım: bir işe doğrudan kullanıcı arayarak ekip üyesi ekleme

CREATE TABLE IF NOT EXISTS job_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(80),
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (job_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_job_members_job_id ON job_members(job_id);
CREATE INDEX IF NOT EXISTS idx_job_members_user_id ON job_members(user_id);

ALTER TABLE job_members ENABLE ROW LEVEL SECURITY;
