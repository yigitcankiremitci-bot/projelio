-- 062 GERİ ALMA
--
-- Bu dosyayı yalnızca migration 062 beklenmedik bir soruna yol açarsa
-- çalıştırın. Supabase'in yeni proje varsayılanına döner: anon ve authenticated
-- rolleri public şemadaki her şey üzerinde yetki sahibi olur.
--
-- UYARI: Bu, güvenlik duruşunu ZAYIFLATIR. Geri aldıktan sonra tek koruma
-- katmanı RLS'tir (tablolarda açık, politika yok). RLS'e dokunulmadığı için
-- veri yine de dışarı sızmaz — ama yanlışlıkla eklenecek tek bir izin verici
-- politika, o an her şeyi okunur hâle getirir. Kalıcı çözüm değildir.
--
-- Not: RLS bilerek geri alınmıyor. 062 zaten RLS'i "kapalıysa aç" mantığıyla
-- işletti; kapatmak yeni bir açık yaratmak olurdu.

grant all on all tables    in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant all on all functions in schema public to anon, authenticated;
grant usage  on schema public to anon, authenticated;

alter default privileges for role postgres in schema public grant all on tables    to anon, authenticated;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated;

-- search_path sabitlemesi güvenlik açısından zararsız bir iyileştirmedir;
-- geri alınmasına gerek yok, bu yüzden burada yer almıyor.

comment on schema public is null;
