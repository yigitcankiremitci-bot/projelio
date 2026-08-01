-- Projelio AI: sohbet geçmişi ve kredi sistemi.
--
-- Kredi modeli: Projelio, Anthropic'ten token bazlı maliyetle hizmet alır ve kullanıcıya
-- soyut "Projelio Kredisi" olarak, üzerine komisyon ekleyerek satar. Her AI isteğinde
-- harcanan token'lar ölçülür, ham maliyet USD olarak hesaplanır, komisyon eklenir ve
-- karşılığı kredi kullanıcının bakiyesinden düşülür.

-- --------------------------------------------------------------------------
-- Sohbetler
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL DEFAULT 'Yeni sohbet',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id, updated_at DESC);

-- --------------------------------------------------------------------------
-- Mesajlar
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  -- Asistan mesajları için o turda harcanan kaynaklar (kullanıcı mesajlarında 0'dır).
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  credits_charged NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);

-- --------------------------------------------------------------------------
-- Kredi bakiyesi (kullanıcı başına tek satır)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_credit_balances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Ömür boyu toplamlar (raporlama için)
  lifetime_purchased NUMERIC(14, 2) NOT NULL DEFAULT 0,
  lifetime_spent NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --------------------------------------------------------------------------
-- Kredi hareketleri (defter)
-- --------------------------------------------------------------------------
-- credits: pozitif = yükleme/iade, negatif = kullanım.
-- cost_usd / charged_usd yalnızca Projelio'nun kendi marj takibi içindir; kullanıcıya
-- gösterilmesi zorunlu değildir.
CREATE TABLE IF NOT EXISTS ai_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(16) NOT NULL CHECK (type IN ('topup', 'usage', 'refund', 'adjustment', 'welcome')),
  credits NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2) NOT NULL,
  description TEXT,
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  model VARCHAR(64),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd NUMERIC(12, 6),
  charged_usd NUMERIC(12, 6),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_tx_user ON ai_credit_transactions(user_id, created_at DESC);

-- --------------------------------------------------------------------------
-- Bakiyeyi atomik olarak değiştiren yardımcı fonksiyon.
-- Eşzamanlı isteklerde yarış koşulu (race condition) oluşmaması için bakiye satırı
-- kilitlenir. Yetersiz bakiyede istisna fırlatır.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_apply_credit_change(
  p_user_id UUID,
  p_credits NUMERIC,
  p_allow_negative BOOLEAN DEFAULT FALSE
) RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  INSERT INTO ai_credit_balances (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM ai_credit_balances WHERE user_id = p_user_id FOR UPDATE;

  IF NOT p_allow_negative AND p_credits < 0 AND v_balance + p_credits < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  UPDATE ai_credit_balances
  SET balance = balance + p_credits,
      lifetime_purchased = lifetime_purchased + GREATEST(p_credits, 0),
      lifetime_spent = lifetime_spent + GREATEST(-p_credits, 0),
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- RLS: diğer tablolarla tutarlı olsun diye açılır. Backend service_role anahtarıyla
-- bağlandığı için RLS'i baypas eder; bu tablolara istemci doğrudan erişmez.
-- --------------------------------------------------------------------------
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_credit_transactions ENABLE ROW LEVEL SECURITY;
