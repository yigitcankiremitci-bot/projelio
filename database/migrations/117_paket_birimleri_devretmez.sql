-- Paketle gelen aylık Lio birimleri dönem sonunda SONA ERER, devretmez.
--
-- NEDEN: Kullanım Koşulları "Paketinize dâhil birimler dönem sonunda devretmez;
-- satın alınan birimler devreder" diyor, ama bakiye tek bir sayıydı: abonelikle
-- gelen birim de satın alınan birim de aynı sayaca ekleniyor ve sonsuza kadar
-- kalıyordu. Koşullar ile kod çelişiyordu (2026-09-18'de fark edildi, o gün
-- hiç abonelik yoktu — geçmişe dönük düzeltme gerekmedi).
--
-- MODEL: balance TOPLAM bakiye olarak kalır (her okuyan yer aynen çalışır).
-- plan_balance, toplamın içindeki "bu dönemin paket birimi" payıdır:
--   · Harcama ÖNCE bu paydan düşer — satın alınan bakiye boşa gitmesin.
--   · Dönem bitince (plan_expires_at) kalan pay toplamdan silinir ve deftere
--     'expire' satırı yazılır; kullanıcı neyin neden gittiğini görür.
--   · Yeni dönemin yüklemesi önce eskiyi sona erdirir, sonra yeniyi ekler.
-- Değişmez: 0 <= plan_balance <= max(balance, 0). Tersine çevirme (108) gibi
-- bu payı bilmeyen yollar bakiyeyi düşürebilir; sona erdirme bu yüzden her
-- zaman LEAST(plan_balance, balance) kadar siler, eksiye düşürmez.

ALTER TABLE ai_credit_balances
  ADD COLUMN IF NOT EXISTS plan_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Gece işi yalnızca süresi dolmuş payı olan satırlara baksın.
CREATE INDEX IF NOT EXISTS idx_ai_credit_balances_plan_expiry
  ON ai_credit_balances (plan_expires_at)
  WHERE plan_balance > 0;

ALTER TABLE ai_credit_transactions DROP CONSTRAINT IF EXISTS ai_credit_transactions_type_check;
ALTER TABLE ai_credit_transactions ADD CONSTRAINT ai_credit_transactions_type_check
  CHECK (type IN ('topup', 'usage', 'refund', 'adjustment', 'welcome', 'expire'));

-- ---------------------------------------------------------------------------
-- Harcama: 084'teki fonksiyonun aynısı + harcama önce paket payından düşer.
-- İmza DEĞİŞMEDİ: migration kod yayınından önce uygulanabilir.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_charge_credits(
  p_user_id         UUID,
  p_credits         NUMERIC,
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
  INSERT INTO ai_credit_balances (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM ai_credit_balances WHERE user_id = p_user_id FOR UPDATE;

  IF NOT p_allow_negative AND p_credits < 0 AND v_balance + p_credits < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  UPDATE ai_credit_balances
  SET balance = balance + p_credits,
      plan_balance = CASE WHEN p_credits < 0 THEN GREATEST(plan_balance + p_credits, 0) ELSE plan_balance END,
      lifetime_purchased = lifetime_purchased + GREATEST(p_credits, 0),
      lifetime_spent = lifetime_spent + GREATEST(-p_credits, 0),
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

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

-- ---------------------------------------------------------------------------
-- Kalan paket payını sona erdirir (satır KİLİTLİ olmalı — çağıranlar kilitler).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_plan_payini_bitir(p_user_id UUID) RETURNS NUMERIC AS $$
DECLARE
  v_plan NUMERIC;
  v_balance NUMERIC;
  v_silinecek NUMERIC;
BEGIN
  SELECT plan_balance, balance INTO v_plan, v_balance FROM ai_credit_balances WHERE user_id = p_user_id;
  v_silinecek := LEAST(COALESCE(v_plan, 0), GREATEST(COALESCE(v_balance, 0), 0));

  IF v_silinecek > 0 THEN
    -- lifetime_spent'e YAZILMAZ: sona eren birim harcanmış değildir.
    UPDATE ai_credit_balances
    SET balance = balance - v_silinecek, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;

    INSERT INTO ai_credit_transactions (user_id, type, credits, balance_after, description)
    VALUES (p_user_id, 'expire', -v_silinecek, v_balance, 'Paket biriminin süresi doldu');
  END IF;

  UPDATE ai_credit_balances SET plan_balance = 0, plan_expires_at = NULL WHERE user_id = p_user_id;
  RETURN v_silinecek;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Dönemin paket birimini yükler: önce eskisini bitirir, sonra yeniyi ekler.
-- Defter satırının id'sini döner (subscription_credit_grants.transaction_id).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_grant_plan_credits(
  p_user_id     UUID,
  p_credits     NUMERIC,
  p_description TEXT,
  p_expires_at  TIMESTAMPTZ
) RETURNS UUID AS $$
DECLARE
  v_balance NUMERIC;
  v_tx UUID;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDITS';
  END IF;

  INSERT INTO ai_credit_balances (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  PERFORM 1 FROM ai_credit_balances WHERE user_id = p_user_id FOR UPDATE;

  PERFORM ai_plan_payini_bitir(p_user_id);

  UPDATE ai_credit_balances
  SET balance = balance + p_credits,
      plan_balance = p_credits,
      plan_expires_at = p_expires_at,
      lifetime_purchased = lifetime_purchased + p_credits,
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO ai_credit_transactions (user_id, type, credits, balance_after, description)
  VALUES (p_user_id, 'topup', p_credits, v_balance, p_description)
  RETURNING id INTO v_tx;

  RETURN v_tx;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Gece işi: süresi dolmuş tüm paket paylarını bitirir. Sona eren kullanıcı
-- sayısını döner. SKIP LOCKED: o an harcama yapan kullanıcıyı beklemez, bir
-- sonraki gece (ya da yeni dönem yüklemesinde) yakalanır.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai_expire_plan_credits() RETURNS INTEGER AS $$
DECLARE
  v_user UUID;
  v_sayi INTEGER := 0;
BEGIN
  FOR v_user IN
    SELECT user_id FROM ai_credit_balances
    WHERE plan_balance > 0 AND plan_expires_at IS NOT NULL AND plan_expires_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM ai_plan_payini_bitir(v_user);
    v_sayi := v_sayi + 1;
  END LOOP;
  RETURN v_sayi;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION ai_plan_payini_bitir(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_grant_plan_credits(UUID, NUMERIC, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION ai_expire_plan_credits() FROM PUBLIC, anon, authenticated;
