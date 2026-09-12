-- 109_kullanici_etkinligi_ve_demo_rolu.sql
-- Kullanıcıların uygulamada geçirdiği süre + demo hesapları için "demo" rolü
--
-- SORUN 1: ETKİNLİK
-- -----------------
-- Admin panelinde "kim uygulamayı gerçekten kullanıyor" sorusunun cevabı yoktu.
-- Kayıt tarihi ve kredi harcaması dolaylı işaretler: Lio'yu hiç açmayan ama her
-- gün görev yöneten biri "etkin değil" görünüyordu.
--
-- MODEL
-- -----
-- İstemci, sekme görünürken ve kullanıcı son birkaç dakikada bir şeye
-- dokunduysa dakikada bir sinyal gönderir (apps/web/src/lib/etkinlikSayaci.ts).
-- SÜREYİ İSTEMCİ BİLDİRMEZ, sunucu hesaplar: iki sinyal arası geçen süre,
-- ancak `p_azami_aralik` saniyeden kısaysa sayılır.
--
-- NEDEN SUNUCU HESAPLIYOR:
--   · Aynı anda üç sekme açık olsa bile süre üç katına çıkmaz — her sinyal
--     yalnızca bir öncekinden bu yana geçen süreyi ekler, sekmelerin
--     sinyalleri aynı zaman çizgisini paylaşır.
--   · İstemcinin "şu kadar saniye kullandım" demesine güvenmek, sayacı
--     şişirmeyi tek bir istek kadar kolay yapardı.
--   · Uzun bir boşluk (bilgisayar uykuda, sekme arkada) sayılmaz: aralık
--     eşiği aşarsa o sinyal süreye bir şey eklemez, yalnızca saati yeniden
--     başlatır.
--
--   user_activity_state — kullanıcı başına tek satır: son sinyal ve toplam süre.
--                         Toplam burada tutuluyor ki liste her açıldığında
--                         bütün günlerin toplamı alınmasın.
--   user_activity_days  — gün başına süre (Europe/Istanbul günü). Son 7/30 gün
--                         ve aktif gün sayısı buradan.
--
-- SORUN 2: DEMO ROLÜ
-- ------------------
-- `@celikhan.test` hesapları (herkese açık demo şirketinin kadrosu, bkz.
-- common/demo-hesap.ts) listede gerçek kullanıcılarla karışıyordu. Artık
-- `role = 'demo'`. Yetki açısından 'freelancer' ile aynı: kod yalnızca
-- `role === 'admin'` kontrolü yapıyor, başka bir rol değeri hiçbir kapı açmıyor.
--
-- DİKKAT: demo sıfırlaması `users` satırlarını anlık görüntüden upsert ediyor
-- ve eski anlık görüntülerde rol 'freelancer'. Sıfırlama rolü her yazımda
-- 'demo'ya zorluyor (demo-sifirlama.service.ts); yoksa bu UPDATE ilk demo
-- girişinde geri alınırdı.

-- ============================================================ Demo rolü

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'freelancer', 'demo'));

UPDATE users SET role = 'demo' WHERE lower(email) LIKE '%@celikhan.test' AND role <> 'admin';

-- ============================================================ Etkinlik

CREATE TABLE IF NOT EXISTS user_activity_state (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_seen_at TIMESTAMP NOT NULL,
  last_seen_at TIMESTAMP NOT NULL,
  total_seconds NUMERIC(14, 1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_activity_days (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  active_seconds NUMERIC(12, 1) NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Liste "son 30 gün" için yalnızca yakın günleri okuyor.
CREATE INDEX IF NOT EXISTS idx_user_activity_days_day ON user_activity_days(day);

REVOKE ALL ON user_activity_state FROM anon, authenticated;
REVOKE ALL ON user_activity_days FROM anon, authenticated;

-- Sinyali işler. Zaman damgaları UTC olarak saat dilimsiz yazılır — diğer
-- TIMESTAMP sütunlarıyla aynı (backend toISOString() yazıyor).
CREATE OR REPLACE FUNCTION kullanici_etkinligi_isle(
  p_user_id       UUID,
  p_azami_aralik  INTEGER DEFAULT 150
) RETURNS VOID AS $$
DECLARE
  v_simdi  TIMESTAMP := (now() AT TIME ZONE 'UTC');
  v_gun    DATE := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_son    TIMESTAMP;
  v_fark   NUMERIC;
  v_eklendi INTEGER;
BEGIN
  INSERT INTO user_activity_state (user_id, first_seen_at, last_seen_at)
  VALUES (p_user_id, v_simdi, v_simdi)
  ON CONFLICT (user_id) DO NOTHING;
  GET DIAGNOSTICS v_eklendi = ROW_COUNT;
  -- İlk sinyal yalnızca saati başlatır: öncesinde ne kadar kullanıldığı bilinmiyor.
  IF v_eklendi > 0 THEN
    RETURN;
  END IF;

  -- Kilit: aynı anda gelen iki sekmenin sinyali aynı aralığı iki kez saymasın.
  SELECT last_seen_at INTO v_son FROM user_activity_state WHERE user_id = p_user_id FOR UPDATE;
  v_fark := EXTRACT(EPOCH FROM (v_simdi - v_son));
  IF v_fark <= 0 THEN
    RETURN;
  END IF;

  IF v_fark > p_azami_aralik THEN
    -- Boşluktan sonra ilk sinyal: süre eklenmez, saat yeniden başlar.
    UPDATE user_activity_state SET last_seen_at = v_simdi WHERE user_id = p_user_id;
    RETURN;
  END IF;

  UPDATE user_activity_state
  SET last_seen_at = v_simdi,
      total_seconds = total_seconds + v_fark
  WHERE user_id = p_user_id;

  INSERT INTO user_activity_days (user_id, day, active_seconds)
  VALUES (p_user_id, v_gun, v_fark)
  ON CONFLICT (user_id, day)
  DO UPDATE SET active_seconds = user_activity_days.active_seconds + EXCLUDED.active_seconds;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION kullanici_etkinligi_isle(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- Admin listesi için kullanıcı başına özet. "Bugün" Europe/Istanbul günü.
CREATE OR REPLACE FUNCTION admin_kullanici_etkinlik_ozeti()
RETURNS TABLE (
  user_id UUID,
  first_seen_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  total_seconds NUMERIC,
  seconds_7d NUMERIC,
  seconds_30d NUMERIC,
  active_days_30d INTEGER
) AS $$
  WITH bugun AS (SELECT (now() AT TIME ZONE 'Europe/Istanbul')::date AS gun)
  SELECT
    s.user_id,
    s.first_seen_at,
    s.last_seen_at,
    s.total_seconds,
    COALESCE(SUM(d.active_seconds) FILTER (WHERE d.day > b.gun - 7), 0),
    COALESCE(SUM(d.active_seconds), 0),
    COUNT(d.day)::INTEGER
  FROM user_activity_state s
  CROSS JOIN bugun b
  LEFT JOIN user_activity_days d ON d.user_id = s.user_id AND d.day > b.gun - 30
  GROUP BY s.user_id, s.first_seen_at, s.last_seen_at, s.total_seconds;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION admin_kullanici_etkinlik_ozeti() FROM PUBLIC, anon, authenticated;
