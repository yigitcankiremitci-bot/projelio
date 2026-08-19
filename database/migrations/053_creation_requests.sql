-- 053_creation_requests.sql
-- Taşeronun iş/proje açma talepleri.
--
-- Taşeron dış kaynaktır: şirketin yapısına doğrudan kayıt ekleyemez. Bir işe
-- ya da projeye ihtiyacı olduğunda kaydı AÇMAZ, talep oluşturur; yetkili kişi
-- onaylayınca gerçek kayıt talebin içindeki payload'dan üretilir.
--
-- Neden ayrı tablo: iş/proje tablolarına "pending" durumu eklemek, o kayıtları
-- okuyan onlarca sorgunun hepsine bir filtre borcu yüklerdi (biri unutulunca
-- onaylanmamış proje listelerde görünürdü). Talep ayrı yaşar, onaylanınca
-- normal bir kayıt doğar.
--
-- scope: talebin kime gideceğini belirler.
--   kind='project' → job_id dolu, onaylayan işin sahibi
--   kind='job'     → organization_id dolu, onaylayan org sahibi + taşeronun
--                    kadrosunda olduğu departmanların yöneticileri
-- Organizasyona bağlanmayan (kişisel/serbest) iş için hiç talep açılmaz;
-- taşeron kendi defterini serbestçe tutar.

CREATE TABLE IF NOT EXISTS creation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('job', 'project')),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Kapsam: ikisinden tam olarak biri dolu olur.
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,

  -- Onaylanınca kaydın hangi alanlarla açılacağı (başlık, açıklama, tarihler…).
  -- Serbest şema: iş ve proje farklı alanlar taşıyor, ikisini tek tabloda
  -- kolonlaştırmak boş kolon ormanı yaratırdı.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  decided_by UUID REFERENCES users(id) ON DELETE SET NULL,
  decided_at TIMESTAMP,
  -- Ret gerekçesi. Reddedilen talep silinmez: taşeron neden reddedildiğini
  -- görebilmeli, yönetici de geçmişe bakabilmeli.
  decision_note TEXT,
  -- Onaylandığında doğan kaydın id'si — bildirimden doğrudan oraya gitmek için.
  created_entity_id UUID,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT creation_requests_scope_check CHECK (
    (kind = 'project' AND job_id IS NOT NULL AND organization_id IS NULL) OR
    (kind = 'job' AND organization_id IS NOT NULL AND job_id IS NULL)
  )
);

-- Talep sahibinin kendi listesi (bekleyen + geçmiş).
CREATE INDEX IF NOT EXISTS idx_creation_requests_requester
  ON creation_requests(requester_id, status);

-- Onaylayanın kutusu: kapsam bazında bekleyenler.
CREATE INDEX IF NOT EXISTS idx_creation_requests_org
  ON creation_requests(organization_id, status) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_creation_requests_job
  ON creation_requests(job_id, status) WHERE job_id IS NOT NULL;

ALTER TABLE creation_requests ENABLE ROW LEVEL SECURITY;
