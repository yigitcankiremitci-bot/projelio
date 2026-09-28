-- Projelio - PayTR ile abonelik tahsilatı
--
-- iyzico'nun yerine PayTR (bkz. docs/odeme-kurulumu.md). iyzico'da yenilemeyi
-- sağlayıcı yürütüyordu; PayTR'de hazır abonelik ürünü YOK: kart 3D'li ilk
-- ödemede PayTR'de saklanıyor (Kart Saklama API), her dönem sonunda saklı
-- karttan Non3D çekimi BİZ başlatıyoruz. Direkt API + Kart Saklama + Non3D +
-- recurring yetkileri 2026-09-28'de mağazaya tanımlandı ve gerçek kartla denendi.
--
-- ÜÇ DEĞİŞİKLİK:
--   1. subscriptions.source'a 'paytr'.
--   2. Aboneliğin hangi saklı kartla çekileceği (ctoken) ve kartın son 4
--      hanesi abonelik satırında. Kart numarası PayTR'de; ctoken yalnızca o
--      kartın kimliği. Son 4 hane makbuz e-postası ve "hangi karttan
--      çekilecek" bilgisi için.
--   3. paytr_abonelik_odemeleri: her çekim DENEMESİ bir satır.

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_source_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_source_check
    CHECK (source IN ('iyzico', 'app_store', 'play_store', 'manual', 'paytr'));

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS paytr_ctoken TEXT,
    ADD COLUMN IF NOT EXISTS kart_son4 VARCHAR(4),
    -- Yenileme öncesi hatırlatma (yıllık abone ya da fiyat değişikliği) HANGİ
    -- VADE İÇİN gönderildi. Tarih tutuluyor, bayrak değil: bir sonraki dönemde
    -- yeniden gönderilebilmesi için vade değişince kendiliğinden "gönderilmedi"
    -- sayılmalı.
    ADD COLUMN IF NOT EXISTS hatirlatma_vadesi TIMESTAMPTZ,
    -- O hatırlatmada DUYURULAN tutar. Yenilemede çekilecek tutar budur:
    -- "fiyat değiştiyse 7 gün önce haber" sözü, duyurulmamış bir tutarın
    -- çekilmemesi demek (bkz. paytr-abonelik-takvim.ts yenilemeTutari).
    ADD COLUMN IF NOT EXISTS hatirlatma_tutari NUMERIC(12, 2);

-- Her çekim denemesi bir satır: ilk ödeme, dönem yenilemesi, gecikmiş ödemenin
-- elle yapılması ve kart değişimi (1 TL, otomatik iade).
--
-- NEDEN AYRI TABLO: PayTR'nin sipariş numarası (merchant_oid) alfanümerik ve
-- en fazla 64 karakter; plan, dönem, kapsam ve şirket bilgisi oraya sığmıyor.
-- Numara bu satırın id'sini taşıyor, bildirim gelince her şey buradan okunuyor.
-- Yan kazanç: bir aboneliğin bütün tahsilat geçmişi (başarısız denemeler dahil)
-- tek yerde.
CREATE TABLE IF NOT EXISTS paytr_abonelik_odemeleri (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- ilk:          paket satın alma, kart saklanır, bildirimle abonelik açılır
    -- yenileme:     dönem sonu, saklı karttan Non3D (müşteri ekran başında değil)
    -- elle:         ödemesi düşmüş abonenin "Ödemeyi şimdi yap"ı (3D, kart saklanır)
    -- kart_degisim: 3D ile 1 TL, yeni kart saklanır, tutar iade edilir
    tur             VARCHAR(12) NOT NULL CHECK (tur IN ('ilk', 'yenileme', 'elle', 'kart_degisim')),
    durum           VARCHAR(12) NOT NULL DEFAULT 'bekliyor'
                    CHECK (durum IN ('bekliyor', 'basarili', 'basarisiz', 'iade')),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- 'ilk' satırında abonelik henüz yok; bildirim gelince bağlanır.
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    scope           VARCHAR(16) NOT NULL CHECK (scope IN ('user', 'organization')),
    organization_id UUID,
    plan_key        VARCHAR(32) NOT NULL,
    period          VARCHAR(16) NOT NULL CHECK (period IN ('monthly', 'yearly')),
    -- Ödenen dönemin başlangıcı (yenileme/elle: aboneliğin o anki vadesi).
    -- Çift çekim koruması bu sütun üzerinden.
    donem_basi      TIMESTAMPTZ,
    tutar           NUMERIC(12, 2) NOT NULL,
    para_birimi     VARCHAR(3) NOT NULL DEFAULT 'TRY',
    -- Aynı dönem için kaçıncı deneme (yenilemede 1..5).
    deneme          SMALLINT NOT NULL DEFAULT 1,
    -- PayTR'ye giden sipariş numarası ("ABN" + id + zaman). İade ve durum
    -- sorgusu bu numarayla yapılıyor.
    merchant_oid    TEXT NOT NULL UNIQUE,
    -- Müşterinin IP'si. PayTR her istekte user_ip istiyor; gece çalışan
    -- yenileme işinde müşteri yok, son bilinen IP buradan okunuyor.
    user_ip         TEXT,
    -- Form açılırken PayTR'deki saklı kartlar. Bildirim ctoken döndürmüyor;
    -- saklanan yeni kart, sonraki listeyle bu liste karşılaştırılarak bulunuyor.
    onceki_kartlar  TEXT[],
    -- Müşterinin "her dönem otomatik yenilensin" onayını verdiği an. PayTR'ye
    -- "müşteri tekrarlayan çekime açık onay verecek" dendi; kanıtı bu.
    yenileme_onayi_at TIMESTAMPTZ,
    hata            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    tamamlandi_at   TIMESTAMPTZ
);

-- ÇİFT ÇEKİM KORUMASI: bir aboneliğin bir dönemi için aynı anda en fazla BİR
-- bekleyen ya da başarılı YENİLEME. Gece işi iki kez koşsa (iki konteyner,
-- elle tetikleme) ikinci satır burada reddedilir ve PayTR'ye hiç gidilmez.
-- Başarısız denemeler kapsam dışı: yeniden deneme yeni bir satır açıyor.
-- 'elle' ve 'kart_degisim' dışarıda, bilerek: tarayıcıda yarım bırakılan bir
-- 3D formu 'bekliyor'da kalır ve bir sonraki denemeyi kilitlememeli.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_paytr_yenileme_donemi
    ON paytr_abonelik_odemeleri (subscription_id, donem_basi)
    WHERE tur = 'yenileme' AND durum IN ('bekliyor', 'basarili');

CREATE INDEX IF NOT EXISTS idx_paytr_odemeleri_abonelik
    ON paytr_abonelik_odemeleri (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paytr_odemeleri_kullanici
    ON paytr_abonelik_odemeleri (user_id, created_at DESC);
