-- Projelio - İndirim kodları (abonelik + Lio Bakiyesi paketleri)
--
-- Kodu yalnızca yönetici oluşturur (Admin > Paketler ve ödeme). Müşteri kodu
-- ödeme formunda girer; indirimli tutar SUNUCUDA hesaplanır.
--
-- KURALLAR (kullanıcı kararı, 2026-09-28):
--   · Yüzde ya da sabit TL. Sonuç hiçbir zaman 1 ₺'nin altına inmez: PayTR
--     0 ₺ ödeme almıyor ve kart ancak bir ödemeyle saklanabiliyor.
--   · Süre kodda seçilir: yalnızca ilk ödeme / ilk N ödeme / süresiz.
--   · Hem abonelikte hem Lio Bakiyesi paketlerinde geçerli olabilir.
--   · Kişi başı bir kez; isteğe bağlı son tarih ve toplam kullanım sınırı.
--
-- DEĞER DEĞİŞTİRİLEMEZ: oluşturulan kodun türü/değeri/süresi sonradan
-- düzenlenmez, yalnızca kapatılır. Kodu kullanmış abonelerin yenilemeleri bu
-- satıra bakıyor; değeri değiştirmek, müşteriye söylenmiş indirimi geriye
-- dönük değiştirmek olurdu.

CREATE TABLE IF NOT EXISTS indirim_kodlari (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Büyük harfe çevrilmiş hâli saklanır; müşteri "ilkay50" da yazsa eşleşir.
    kod              VARCHAR(40) NOT NULL UNIQUE,
    aciklama         TEXT,
    tur              VARCHAR(8) NOT NULL CHECK (tur IN ('yuzde', 'tutar')),
    deger            NUMERIC(12, 2) NOT NULL CHECK (deger > 0),
    kapsam           VARCHAR(10) NOT NULL CHECK (kapsam IN ('abonelik', 'lio', 'hepsi')),
    -- Boş = hepsi. Abonelikte paket anahtarları (starter/pro/business) ve
    -- dönemler (monthly/yearly); Lio'da paket sınırı yok.
    plan_keys        TEXT[],
    periods          TEXT[],
    -- ilk: yalnızca ilk ödeme · donem: ilk N ödeme (donem_sayisi) · surekli
    sure             VARCHAR(8) NOT NULL DEFAULT 'ilk' CHECK (sure IN ('ilk', 'donem', 'surekli')),
    donem_sayisi     SMALLINT CHECK (donem_sayisi IS NULL OR donem_sayisi >= 1),
    son_tarih        TIMESTAMPTZ,
    -- Kullanım SAYACI YOK: sayı indirim_kullanimlari'ndan sayılır; ayrı bir
    -- sayaç zamanla tabloyla ayrışırdı.
    kullanim_siniri  INTEGER CHECK (kullanim_siniri IS NULL OR kullanim_siniri >= 1),
    aktif            BOOLEAN NOT NULL DEFAULT true,
    created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT indirim_yuzde_siniri CHECK (tur <> 'yuzde' OR deger <= 100),
    CONSTRAINT indirim_donem_tutarli CHECK ((sure = 'donem') = (donem_sayisi IS NOT NULL))
);

-- Her kullanım bir satır; KİŞİ BAŞI BİR KEZ veritabanında zorlanır.
-- Kullanım ÖDEME ALININCA yazılır, form açılınca değil: vazgeçilen ödeme
-- kodu harcamasın.
CREATE TABLE IF NOT EXISTS indirim_kullanimlari (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kod_id             UUID NOT NULL REFERENCES indirim_kodlari(id) ON DELETE CASCADE,
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id    UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    ai_credit_order_id UUID REFERENCES ai_credit_orders(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT indirim_kisi_basi_bir UNIQUE (kod_id, user_id)
);

-- Aboneliğin taşıdığı indirim. Yenilemede uygulanır:
--   indirim_kodu_id NULL            → indirim yok
--   indirim_kalan_donem NULL        → süresiz
--   indirim_kalan_donem > 0         → bir sonraki ödemede uygulanır, sonra 1 azalır
--   indirim_kalan_donem = 0         → bitti (normal fiyat)
-- liste_tutari: son ödemede İNDİRİMSİZ tutar. price_amount indirimli tutarı
-- tutuyor; indirim bitince yenileme bu tutara dönmeli.
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS indirim_kodu_id UUID REFERENCES indirim_kodlari(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS indirim_kalan_donem SMALLINT,
    ADD COLUMN IF NOT EXISTS liste_tutari NUMERIC(12, 2),
    -- Hatırlatmada duyurulan tutarın İNDİRİMSİZ hâli (hatirlatma_tutari'nın
    -- yanında). Yenileme ödenince liste_tutari'na bu yazılır; yoksa indirim
    -- bittiğinde hangi liste fiyatına dönüleceği bilinemezdi.
    ADD COLUMN IF NOT EXISTS hatirlatma_liste_tutari NUMERIC(12, 2);

ALTER TABLE paytr_abonelik_odemeleri
    ADD COLUMN IF NOT EXISTS indirim_kodu_id UUID REFERENCES indirim_kodlari(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS liste_tutari NUMERIC(12, 2);

ALTER TABLE ai_credit_orders
    ADD COLUMN IF NOT EXISTS indirim_kodu_id UUID REFERENCES indirim_kodlari(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS liste_tutari NUMERIC(12, 2);
