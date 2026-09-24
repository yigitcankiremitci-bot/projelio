-- Projelio - Bildirim tercihleri (hangi bildirim, hangi kanaldan)
--
-- Tercih TİP başına tutulur, arayüz kategorilerle gruplar
-- (packages/shared/src/bildirimTercihleri.ts). `tipler` yalnızca KAPATILAN
-- kanalları taşır: {"post_like": {"anlik": false}}. Yazılmayan kanal açık.
--
-- Satır YOKSA her şey açık — yani bu migration tek başına hiçbir kullanıcının
-- bildirimini değiştirmez. Tablo okunamazsa (migration uygulanmadan) sunucu da
-- "her şey açık"a düşer, bildirim gönderimi durmaz.
--
-- E-posta kanalının SIKLIĞI (anlık / günlük, saat) ayrı tabloda kalıyor
-- (notification_email_prefs, 102/103): o "ne zaman", bu "hangileri".

CREATE TABLE IF NOT EXISTS notification_type_prefs (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tipler JSONB NOT NULL DEFAULT '{}'::jsonb,
    ses BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE notification_type_prefs IS
  'Bildirim tipi x kanal tercihi. Satir yoksa hepsi acik. tipler yalnizca kapatilan kanallari tutar.';
COMMENT ON COLUMN notification_type_prefs.ses IS
  'Uygulama acikken bildirim sesi (web). Telefonun sesi Android kanal ayarinda.';

DROP TRIGGER IF EXISTS trg_notification_type_prefs_updated_at ON notification_type_prefs;
CREATE TRIGGER trg_notification_type_prefs_updated_at
  BEFORE UPDATE ON notification_type_prefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE notification_type_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON notification_type_prefs FROM anon, authenticated;
