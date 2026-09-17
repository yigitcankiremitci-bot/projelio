-- 116_demo_ziyaret_analitigi.sql
-- Demo hesabına girenler önce neyi merak ediyor? (Admin > Demo ziyaretleri)
--
-- KİŞİ DEĞİL OTURUM
-- -----------------
-- Demo hesabı herkese açık ve ortak (common/demo-hesap.ts): kullanıcı kimliği
-- hiçbir ziyaretçiyi ayırt etmez. Her demo girişinde tarayıcı rastgele bir
-- ziyaret kimliği üretir (sessionStorage). IP, tarayıcı kimliği, e-posta ya da
-- sonradan açılan hesapla eşleşme TUTULMAZ — tablo bilerek bunlar için sütun
-- içermiyor. Gizlilik politikası (madde 14) ve giriş ekranındaki demo kutusu
-- bu ölçümü açıkça söylüyor; ikisini ayrı ayrı değiştirme.
--
-- NE YAZILIR
--   sayfa   — ziyaret edilen sayfanın anahtarı (/projects/:id), etkin süresiyle
--   ozellik — adresi olmayan özellikler (Lio paneli)
--   tikla   — düğme/sekme etiketi (en fazla 60 karakter). Yazılan içerik,
--             form alanları ve Lio'ya gönderilen metin YAZILMAZ.
--
-- SAKLAMA: 90 gün — data-retention işi (`SAKLAMA_GUN.demoZiyaret`), son
-- görülmeden sayılır; olaylar ziyaretle birlikte CASCADE ile gider.

CREATE TABLE IF NOT EXISTS demo_ziyaretler (
  id UUID PRIMARY KEY,
  basladi_at TIMESTAMP NOT NULL,
  son_gorulme_at TIMESTAMP NOT NULL,
  cihaz TEXT NOT NULL DEFAULT 'masaustu' CHECK (cihaz IN ('mobil', 'tablet', 'masaustu')),
  kaynak TEXT CHECK (kaynak IN ('tanitim', 'giris')),
  dil TEXT
);

CREATE INDEX IF NOT EXISTS idx_demo_ziyaretler_basladi ON demo_ziyaretler(basladi_at);

CREATE TABLE IF NOT EXISTS demo_olaylari (
  id BIGSERIAL PRIMARY KEY,
  ziyaret_id UUID NOT NULL REFERENCES demo_ziyaretler(id) ON DELETE CASCADE,
  -- Ziyaret içinde artan sayı. Aynı sıra yeniden gelirse satır GÜNCELLENİR:
  -- açık sayfanın olayı her gönderimde o anki süresiyle tekrar yollanıyor,
  -- böylece sekme kapanırken son paket kaybolsa da süre büyük ölçüde kalır.
  sira INTEGER NOT NULL,
  at TIMESTAMP NOT NULL,
  tur TEXT NOT NULL CHECK (tur IN ('sayfa', 'ozellik', 'tikla')),
  anahtar TEXT NOT NULL,
  sayfa TEXT NOT NULL,
  sure_sn NUMERIC(7, 1),
  UNIQUE (ziyaret_id, sira)
);

CREATE INDEX IF NOT EXISTS idx_demo_olaylari_at ON demo_olaylari(at);

REVOKE ALL ON demo_ziyaretler FROM anon, authenticated;
REVOKE ALL ON demo_olaylari FROM anon, authenticated;
