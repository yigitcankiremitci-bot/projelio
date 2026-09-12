-- 107 GERİ ALMA
--
-- Bu dosyayı yalnızca migration 107 beklenmedik bir soruna yol açarsa
-- çalıştırın.
--
-- ⚠️ VERİ KAYBI VAR: girilmiş tüm künye bilgileri (vergi no, adres, MERSİS),
-- kullanıcının eklediği alanlar ve belge kayıtları silinir.
--
-- DOSYALAR SİLİNMEZ: belge satırları yalnızca `files` tablosundaki kayda işaret
-- ediyordu, dosyanın kendisi kendi klasöründe (ve bulutta) duruyor. Kaybolan
-- şey "bu dosya vergi levhasıdır" bilgisi.

-- Sıra önemli: yabancı anahtarlar yüzünden yavrudan ebeveyne.
drop table if exists public.info_card_documents;
drop table if exists public.info_card_fields;
drop table if exists public.info_cards;
