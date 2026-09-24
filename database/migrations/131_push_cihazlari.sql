-- Projelio - Mobil uygulama bildirim cihazları (FCM)
--
-- NEDEN AYRI TABLO: push_subscriptions (005) web push'un biçimini taşıyor
-- (endpoint + p256dh + auth). Android kabuğunda web push çalışmıyor
-- (WebView'de PushManager yok); orada bildirim FCM'den gelir ve cihazın tek
-- kimliği bir kayıt anahtarıdır. İki biçimi tek tabloya sıkıştırmak iki
-- sütun grubunun da yarı boş kalması demekti.
--
-- token TEKİL: aynı telefonda çıkış yapıp başka hesapla girildiğinde satır
-- yeni kullanıcıya TAŞINIR (upsert). Aksi hâlde eski kullanıcının
-- bildirimleri o telefona gitmeye devam ederdi.

CREATE TABLE IF NOT EXISTS push_cihazlari (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    platform VARCHAR(16) NOT NULL DEFAULT 'android',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_cihazlari_user_id ON push_cihazlari(user_id);

ALTER TABLE push_cihazlari ENABLE ROW LEVEL SECURITY;
