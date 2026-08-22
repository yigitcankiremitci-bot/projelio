-- İki ayrı sorun, tek migration.

-- --------------------------------------------------------------------------
-- 1) Kredi tutmaları (hold)
-- --------------------------------------------------------------------------
-- Sorun: bakiye kontrolü "oku, karar ver, sonra harca" biçimindeydi. Kullanıcı iki
-- sekmede aynı anda istek gönderirse iki istek de aynı bakiyeyi görüp ikisi de
-- "yeter" diyor, sonuç eksi bakiye oluyordu.
--
-- Çözüm: istek başlamadan önce turun en pahalı hâli kadar kredi TUTULUR. Tutma,
-- bakiyeyi düşürmez (defter ve ömür boyu toplamlar bozulmasın) — yalnızca
-- "kullanılabilir bakiye" hesabından düşer. İş bitince tutma kalkar, gerçek
-- tüketim normal yoldan işlenir.
--
-- created_at neden var: süreç çökerse tutma açık kalırdı ve kullanıcının kredisi
-- sonsuza kadar bloke olurdu. Süresi geçmiş tutmalar her rezervasyonda temizlenir.
CREATE TABLE IF NOT EXISTS ai_credit_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits NUMERIC(14, 2) NOT NULL CHECK (credits > 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_holds_user ON ai_credit_holds(user_id, created_at);

-- Kullanılabilir bakiye = bakiye - açık tutmalar.
CREATE OR REPLACE FUNCTION ai_available_credits(
  p_user_id UUID,
  p_ttl_seconds INT DEFAULT 900
) RETURNS NUMERIC AS $$
DECLARE
  v_balance NUMERIC;
  v_held NUMERIC;
BEGIN
  SELECT COALESCE(balance, 0) INTO v_balance FROM ai_credit_balances WHERE user_id = p_user_id;
  SELECT COALESCE(SUM(credits), 0) INTO v_held
    FROM ai_credit_holds
    WHERE user_id = p_user_id
      AND created_at >= CURRENT_TIMESTAMP - (p_ttl_seconds || ' seconds')::INTERVAL;
  RETURN COALESCE(v_balance, 0) - v_held;
END;
$$ LANGUAGE plpgsql;

-- Tutma açar. Yetmiyorsa INSUFFICIENT_CREDITS fırlatır.
-- Bakiye satırı FOR UPDATE ile kilitlenir: eşzamanlı iki istek sıraya girer,
-- ikincisi birincinin tutmasını görerek karar verir.
CREATE OR REPLACE FUNCTION ai_reserve_credits(
  p_user_id UUID,
  p_credits NUMERIC,
  p_ttl_seconds INT DEFAULT 900
) RETURNS UUID AS $$
DECLARE
  v_balance NUMERIC;
  v_held NUMERIC;
  v_id UUID;
BEGIN
  INSERT INTO ai_credit_balances (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM ai_credit_balances WHERE user_id = p_user_id FOR UPDATE;

  DELETE FROM ai_credit_holds
   WHERE user_id = p_user_id
     AND created_at < CURRENT_TIMESTAMP - (p_ttl_seconds || ' seconds')::INTERVAL;

  SELECT COALESCE(SUM(credits), 0) INTO v_held FROM ai_credit_holds WHERE user_id = p_user_id;

  IF COALESCE(v_balance, 0) - v_held < p_credits THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO ai_credit_holds (user_id, credits) VALUES (p_user_id, p_credits)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION ai_release_credits(p_hold_id UUID) RETURNS VOID AS $$
BEGIN
  DELETE FROM ai_credit_holds WHERE id = p_hold_id;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE ai_credit_holds ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- 2) Sohbete sabitlenmiş dosyalar
-- --------------------------------------------------------------------------
-- Sorun: dosya tek bir MESAJA bağlıydı. Geçmiş penceresi son 8 mesajla sınırlı
-- olduğu için iş birkaç turdan uzun sürdüğünde dosya bağlamdan düşüyor, Lio
-- "dosyayı bu turda göremiyorum" deyip aynı soruları tekrar tekrar soruyordu —
-- kullanıcı hem sonuç alamıyor hem yüzlerce kredi ödüyordu.
--
-- Çözüm: dosya SOHBETE sabitlenir ve iş bitene kadar her turda gönderilir.
-- Maliyeti önbellek karşılar (blok her turda aynı olduğu için %90 ucuza okunur).
-- İş bitince Lio release_files ile bırakır ya da kullanıcı arayüzden kaldırır;
-- ondan sonra bir daha gönderilmez.
--
-- Biçim: [{ "id": "...", "name": "plan.xlsx", "kind": "sheet",
--           "detail": "Excel · 2 sayfa · 40 satır", "text": "…" }]
-- Görsel ve PDF'te "text" yoktur; ikili içerik sunucu belleğinde tutulur ve
-- kaybolursa blok bunu açıkça söyler.
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS active_files JSONB;
