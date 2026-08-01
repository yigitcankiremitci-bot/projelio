-- Projelio - Anasayfa bütçe sekmesi: genel defter + düzenli ödemeler

-- Genel bütçe defteri: işlemler artık projeye bağlı olmak zorunda değil (ofis kirası,
-- yazılım aboneliği gibi işletme giderleri projesiz kaydedilebilir). owner_id kaydın
-- hangi kullanıcının defterine ait olduğunu tutar; projeye bağlı kayıtlarda da dolar,
-- böylece kullanıcının tüm hareketleri tek sorguyla çekilebilir.
ALTER TABLE budget_transactions
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id) ON DELETE CASCADE;

UPDATE budget_transactions bt
SET owner_id = p.owner_id
FROM projects p
WHERE bt.project_id = p.id AND bt.owner_id IS NULL;

-- İşlemin gerçekleştiği tarih (created_at kayıt anıdır; geçmişe dönük giriş yapılabilsin).
ALTER TABLE budget_transactions
  ADD COLUMN IF NOT EXISTS occurred_at DATE NOT NULL DEFAULT CURRENT_DATE;

-- Düzenli (tekrarlayan) ödemeler. Vadesi gelince cron otomatik olarak
-- budget_transactions'a kayıt atar, next_due_date'i ilerletir ve bildirim gönderir.
CREATE TABLE IF NOT EXISTS recurring_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
    type VARCHAR NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC NOT NULL,
    description TEXT,
    interval VARCHAR NOT NULL CHECK (interval IN ('weekly', 'monthly', 'yearly')),
    next_due_date DATE NOT NULL,
    -- Ayın kaçında tekrarlandığı. "Her ayın 31'i" olan bir ödeme Şubat'ta 28'e çekilir,
    -- ama sonraki aylarda tekrar 31'e dönebilmesi için asıl gün burada sabit tutulur.
    anchor_day INTEGER,
    -- Vadeden kaç gün önce ön-uyarı bildirimi gönderileceği.
    reminder_days_before INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Otomatik oluşturulan işlemin hangi düzenli ödemeden geldiği.
ALTER TABLE budget_transactions
  ADD COLUMN IF NOT EXISTS recurring_payment_id UUID REFERENCES recurring_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budget_transactions_owner_id ON budget_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_budget_transactions_project_id ON budget_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_owner_id ON recurring_payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_recurring_payments_due ON recurring_payments(next_due_date) WHERE active;

ALTER TABLE recurring_payments ENABLE ROW LEVEL SECURITY;
