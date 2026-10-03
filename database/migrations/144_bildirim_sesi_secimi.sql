-- Projelio - Kullanıcının seçtiği bildirim sesi
--
-- Anahtar listesi packages/shared/src/bildirimSesleri.ts'te. Sunucu telefona
-- bildirimi bu sesin Android kanalıyla gönderir (projelio_bildirim_<anahtar>);
-- web uygulama açıkken aynı sesi çalar.
--
-- NULL = varsayılan ("projelio"). Bilinmeyen değer okunurken varsayılana düşer,
-- yani listeden bir ses kaldırılırsa seçmiş olanlar sessiz kalmaz. Bu yüzden
-- CHECK kısıtı bilerek YOK: listeyi değiştirmek migration gerektirmesin.
--
-- Migration uygulanmadan: okuma select("*") ile yapıldığı için sorun çıkmaz,
-- kayıt sütunsuz yeniden denenir (bildirim-tercihleri.service.ts).

ALTER TABLE notification_type_prefs ADD COLUMN IF NOT EXISTS ses_secimi TEXT;

COMMENT ON COLUMN notification_type_prefs.ses_secimi IS
  'Bildirim sesi anahtari (shared/bildirimSesleri.ts). NULL = varsayilan (projelio).';
