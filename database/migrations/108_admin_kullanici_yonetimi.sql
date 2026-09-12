-- 108_admin_kullanici_yonetimi.sql
-- Admin paneli: kullanıcı askıya alma, oturum iptali, kredi geri alma, işlem kaydı
--
-- SORUN
-- -----
-- Yöneticinin bir kullanıcı hesabına dokunmasının tek yolu veritabanına SSH ile
-- girip elle SQL yazmaktı. Hesap silmek, kötüye kullanan birini durdurmak ya da
-- yanlış yüklenen krediyi geri almak için ekranda bir yol yoktu; elle yazılan
-- SQL ise uygulamanın kurallarını (sahiplik engelleri, 30 günlük bekleme,
-- kredi defteri) atlıyordu.
--
-- İkinci sorun: oturum jetonu durum taşımıyor (bkz. session-payload.ts) ve
-- sunucuda iptal listesi yoktu. Bir hesabı "kapatmak" mümkün değildi — elinde
-- jeton olan kişi, jeton ömrü dolana kadar (7 gün) API'yi kullanmaya devam
-- ederdi.
--
-- MODEL
-- -----
--   users.banned_at / ban_reason / banned_by
--       Askıya alma. Satır ve veri olduğu gibi durur; yalnızca giriş ve API
--       erişimi kapanır. Silmeden farkı: geri alınabilir ve kimseye bir şey
--       kaybettirmez.
--
--   users.sessions_revoked_at
--       Bu andan ÖNCE başlamış bütün oturumlar geçersiz. Jetondaki `loginAt`
--       ile karşılaştırılıyor; yeniden giriş yapan kişi yeni bir loginAt alır
--       ve etkilenmez. "Tüm cihazlardan çıkış yaptır" ile rol değişikliği bunu
--       kullanıyor — rol jetonun içinde taşındığı için yeniden giriş yapılmadan
--       yeni rol devreye girmez.
--
--   ai_credit_transactions.reverses_transaction_id
--       Bir kredi yüklemesinin geri alınması, orijinal satırı SİLMEZ ya da
--       DEĞİŞTİRMEZ; karşı yönde yeni bir satır yazar. Defter yalnızca ekleme
--       alır — "bu kullanıcıya ne yüklendi, ne geri alındı" her zaman görünür.
--       Tekil indeks aynı satırın iki kez geri alınmasını veritabanı düzeyinde
--       reddeder (iki sekmeden aynı anda basılan düğme).
--
--   admin_user_actions
--       Yöneticinin bir hesaba yaptığı her işlemin kaydı. Kalıcı silmede de
--       duruyor: hedef kullanıcı anonimleştirilir ama satırı silinmez, yani
--       kayıt sahipsiz kalmaz.

ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sessions_revoked_at TIMESTAMP;

-- Oturum kontrolü her 30 saniyede "engelli ya da oturumu iptal edilmiş" satırları
-- okuyor (bkz. hesap-durumu.service.ts). Kısmi indeks o sorguyu, tablonun
-- tamamı büyüse de yalnızca bu birkaç satır üzerinde tutar.
CREATE INDEX IF NOT EXISTS idx_users_oturum_engeli
  ON users(id)
  WHERE banned_at IS NOT NULL OR sessions_revoked_at IS NOT NULL;

ALTER TABLE ai_credit_transactions
  ADD COLUMN IF NOT EXISTS reverses_transaction_id UUID REFERENCES ai_credit_transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ai_credit_tx_reverses
  ON ai_credit_transactions(reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

-- --------------------------------------------------------------------------
-- Bir kredi hareketini geri alır: bakiye + defter satırı tek transaction'da.
--
-- ai_charge_credits'e parametre eklemek yerine AYRI fonksiyon: o fonksiyonun
-- imzası değişirse PostgreSQL yeni bir aşırı yükleme (overload) açar ve eski
-- imzayı çağıran kod belirsizlik hatası alırdı.
--
-- Yalnızca EKLEME yönündeki hareketler geri alınır (topup/adjustment/welcome/
-- refund, pozitif). Harcamayı "geri almak" iade demektir; o, pozitif bir
-- yükleme olarak ayrıca yapılır.
CREATE OR REPLACE FUNCTION ai_reverse_credit_transaction(
  p_transaction_id UUID,
  p_created_by     UUID,
  p_description    TEXT DEFAULT NULL
) RETURNS NUMERIC AS $$
DECLARE
  v_tx      ai_credit_transactions%ROWTYPE;
  v_balance NUMERIC;
BEGIN
  SELECT * INTO v_tx FROM ai_credit_transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TX_NOT_FOUND';
  END IF;
  IF v_tx.credits <= 0 OR v_tx.type NOT IN ('topup', 'adjustment', 'welcome', 'refund') THEN
    RAISE EXCEPTION 'TX_NOT_REVERSIBLE';
  END IF;
  IF v_tx.reverses_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'TX_NOT_REVERSIBLE';
  END IF;

  INSERT INTO ai_credit_balances (user_id) VALUES (v_tx.user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance FROM ai_credit_balances WHERE user_id = v_tx.user_id FOR UPDATE;

  -- Geri alma bakiyeyi eksiye düşürebilir (kullanıcı krediyi harcamış olabilir).
  -- Bu bilinçli: reddetmek "harcanmış yanlış yükleme hiç geri alınamaz" demekti.
  -- Eksi bakiye yeni bir Lio isteğini zaten engelliyor (assertCanStart).
  -- lifetime_purchased da düşülür: yükleme hiç olmamış sayılmalı, yoksa marj
  -- raporu yapılmamış bir satışı gösterirdi.
  UPDATE ai_credit_balances
  SET balance = balance - v_tx.credits,
      lifetime_purchased = GREATEST(lifetime_purchased - v_tx.credits, 0),
      updated_at = CURRENT_TIMESTAMP
  WHERE user_id = v_tx.user_id
  RETURNING balance INTO v_balance;

  -- Tekil indeks (uniq_ai_credit_tx_reverses) ikinci geri almayı BURADA reddeder;
  -- hata yukarıdaki bakiye güncellemesini de geri alır.
  INSERT INTO ai_credit_transactions (
    user_id, type, credits, balance_after, description, created_by, reverses_transaction_id
  ) VALUES (
    v_tx.user_id, 'adjustment', -v_tx.credits, v_balance, p_description, p_created_by, v_tx.id
  );

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION ai_reverse_credit_transaction(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(32) NOT NULL,
  detail JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_user_actions_target
  ON admin_user_actions(target_user_id, created_at DESC);

REVOKE ALL ON admin_user_actions FROM anon, authenticated;
