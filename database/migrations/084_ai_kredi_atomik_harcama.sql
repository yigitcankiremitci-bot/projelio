-- Kredi harcamasını bakiye + defter kaydı olarak TEK İŞLEMDE yazan fonksiyon.
--
-- NEDEN VAR: harcama iki ayrı çağrıyla yapılıyordu —
--   1) ai_apply_credit_change ile bakiye düşülüyor  (atomik, satır kilitli)
--   2) ai_credit_transactions'a insert ile deftere yazılıyor  (AYRI çağrı)
-- İkisinin arasında transaction yoktu ve 2. adımın hatası yalnızca loglanıyordu.
--
-- Somut sonuç: veritabanı bir an hata verdiğinde kullanıcının bakiyesi düşüyor
-- ama defterde karşılığı olmuyordu. Kullanıcı "kredim nereye gitti" diyor ve iz
-- sürecek hiçbir kayıt bulunmuyordu. Rezervasyon tarafında (ai_reserve_credits /
-- ai_release_credits) doğru desen zaten kullanılıyordu; harcama tarafı geride
-- kalmıştı. Bu fonksiyon o asimetriyi kapatıyor.
--
-- plpgsql fonksiyonu tek bir transaction içinde çalışır: bakiye güncellemesi ya
-- da defter kaydı başarısız olursa İKİSİ BİRDEN geri alınır.

CREATE OR REPLACE FUNCTION ai_charge_credits(
  p_user_id         UUID,
  p_credits         NUMERIC,          -- pozitif = ekleme, negatif = harcama
  p_type            VARCHAR(16),
  p_description     TEXT     DEFAULT NULL,
  p_conversation_id UUID     DEFAULT NULL,
  p_model           VARCHAR(64) DEFAULT NULL,
  p_input_tokens    INTEGER  DEFAULT NULL,
  p_output_tokens   INTEGER  DEFAULT NULL,
  p_cost_usd        NUMERIC  DEFAULT NULL,
  p_charged_usd     NUMERIC  DEFAULT NULL,
  p_created_by      UUID     DEFAULT NULL,
  p_order_id        UUID     DEFAULT NULL,
  p_allow_negative  BOOLEAN  DEFAULT TRUE
) RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  -- Bakiye satırı yoksa açılır, sonra KİLİTLENİR: eşzamanlı iki harcama
  -- birbirinin üzerine yazmasın (mevcut ai_apply_credit_change ile aynı desen).
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

  -- Defter kaydı AYNI transaction'da. Buradaki bir hata (ör. FK ihlali) yukarıdaki
  -- bakiye güncellemesini de geri alır — "para düştü ama kaydı yok" durumu artık
  -- veritabanı düzeyinde imkânsız.
  INSERT INTO ai_credit_transactions (
    user_id, type, credits, balance_after, description, conversation_id,
    model, input_tokens, output_tokens, cost_usd, charged_usd, created_by, order_id
  ) VALUES (
    p_user_id, p_type, p_credits, v_balance, p_description, p_conversation_id,
    p_model, p_input_tokens, p_output_tokens, p_cost_usd, p_charged_usd, p_created_by, p_order_id
  );

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

-- 062'deki kuralla aynı çizgi: fonksiyon çağırana ait yetkiyle çalışır ve
-- genel rollere açılmaz. Backend service_role ile bağlanıyor.
REVOKE ALL ON FUNCTION ai_charge_credits(
  UUID, NUMERIC, VARCHAR, TEXT, UUID, VARCHAR, INTEGER, INTEGER, NUMERIC, NUMERIC, UUID, UUID, BOOLEAN
) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION ai_charge_credits(
  UUID, NUMERIC, VARCHAR, TEXT, UUID, VARCHAR, INTEGER, INTEGER, NUMERIC, NUMERIC, UUID, UUID, BOOLEAN
) IS 'Bakiye değişikliği + defter kaydını tek transaction''da yazar. Harcama/iade için ai_apply_credit_change yerine bunu kullan.';
