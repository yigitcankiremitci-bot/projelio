-- 106 GERİ ALMA
--
-- Bu dosyayı yalnızca migration 106 beklenmedik bir soruna yol açarsa
-- çalıştırın.
--
-- ⚠️ VERİ KAYBI VAR ve GERİ ALINAMAZ: girilmiş tüm hesap şifreleri silinir.
-- Şifreler yalnızca burada duruyor ve şifreli oldukları için başka bir yere
-- kopyalanmış olmaları da beklenmez. Çalıştırmadan ÖNCE modülü kullanan
-- kişilere haber verin ve gerekiyorsa yedek alın:
--   pg_dump -t service_accounts -t service_account_credentials ...
--
-- Geçiş anahtarları da silinir: kullanıcılar cihazlarını yeniden kaydetmek
-- zorunda kalır (cihazdaki özel anahtar işe yaramaz hâle gelir, zararsız).
--
-- Düzenli ödeme satırları SİLİNMEZ: onlar defterin kendisine ait (bkz. 104) ve
-- abonelik gideri gerçekten ödeniyor. Bağ koptuğu için modül geri geldiğinde
-- hesapla yeniden eşleşmezler, elle bağlanmaları gerekir.

-- Katalog kaydı: bağlı her şey (organization_modules, job_modules,
-- module_members) ON DELETE CASCADE ile birlikte düşer.
delete from public.module_catalog_departments where module_key = 'hesaplar';
delete from public.module_catalog where key = 'hesaplar';

-- Sıra önemli: yabancı anahtarlar yüzünden yavrudan ebeveyne.
drop table if exists public.service_credential_views;
drop table if exists public.service_account_credentials;
drop table if exists public.service_account_grants;
drop table if exists public.service_accounts;

drop table if exists public.webauthn_challenges;
drop table if exists public.user_passkeys;
