-- 192: Kullanıcıya özel ayrıcalıklar (Admin > Kullanıcılar).
--
-- Kullanıcı kararı (2026-11-10): paketle kısıtlanan haklar (modül sayısı,
-- şirketteki kişi sayısı) ve departman kuralı bazı kullanıcılar için
-- yöneticinin elinden genişletilebilmeli. Kurallar ve neden sahte abonelik
-- satırı açılmadığı: packages/shared/src/ayricalik.ts.
--
-- Satır yoksa ayrıcalık yok. Tablo okunamazsa (migration uygulanmadan) sunucu
-- ayrıcalığı yok sayar, paket kuralları aynen sürer.
--
-- IDEMPOTENT. Geri alma: database/geri-al/192_kullanici_ayricaliklari_geri_al.sql

CREATE TABLE IF NOT EXISTS kullanici_ayricaliklari (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ekstra_modul INTEGER NOT NULL DEFAULT 0 CHECK (ekstra_modul BETWEEN 0 AND 500),
  sinirsiz_modul BOOLEAN NOT NULL DEFAULT FALSE,
  ekstra_kisi INTEGER NOT NULL DEFAULT 0 CHECK (ekstra_kisi BETWEEN 0 AND 500),
  ekstra_departman INTEGER NOT NULL DEFAULT 0 CHECK (ekstra_departman BETWEEN 0 AND 500),
  not_metni TEXT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON kullanici_ayricaliklari FROM anon, authenticated;
