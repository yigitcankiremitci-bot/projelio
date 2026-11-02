-- 181_business_kisi_artirma.sql
-- Business aboneliğinde dönem ortasında kişi artırma (kullanıcı kararı, 2026-11-02).
--
--   paytr_abonelik_odemeleri.tur 'kisi_artirma'
--       3D'li ödeme: dönemin kalan kısmı için fark çekilir. koltuk = yeni kişi
--       sayısı, liste_tutari = yeni kişi sayısıyla bir dönemin liste tutarı.
--       Bildirim gelince aboneliğin koltuğu ve yenileme tutarı güncellenir.
--
--   ai_add_plan_credits
--       Ek kişilerin bu ayki birimini PAKET PAYINA ekler. ai_grant_plan_credits
--       kullanılamaz: o önce mevcut payı bitirip yerine yenisini yazıyor, yani
--       ayın kalanını silerdi. Bu fonksiyon payın üstüne ekler ve aynı ay
--       sonunda biter.

alter table public.paytr_abonelik_odemeleri drop constraint if exists paytr_abonelik_odemeleri_tur_check;
alter table public.paytr_abonelik_odemeleri
  add constraint paytr_abonelik_odemeleri_tur_check
  check (tur in ('ilk', 'yenileme', 'elle', 'kart_degisim', 'kisi_artirma'));

CREATE OR REPLACE FUNCTION ai_add_plan_credits(
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

  -- Süresi geçmiş ama gece işinin henüz bitirmediği pay diriltilmesin.
  IF EXISTS (
    SELECT 1 FROM ai_credit_balances
    WHERE user_id = p_user_id AND plan_expires_at IS NOT NULL AND plan_expires_at <= now()
  ) THEN
    PERFORM ai_plan_payini_bitir(p_user_id);
  END IF;

  UPDATE ai_credit_balances
  SET balance = balance + p_credits,
      plan_balance = plan_balance + p_credits,
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

REVOKE ALL ON FUNCTION ai_add_plan_credits(UUID, NUMERIC, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
