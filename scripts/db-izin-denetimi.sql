-- Projelio — veritabanı izin denetimi
--
-- Supabase Dashboard > SQL Editor'e yapıştırıp çalıştırın. Hiçbir şeyi
-- DEĞİŞTİRMEZ, yalnızca ölçer. Yeni bir tablo/görünüm ekledikten sonra
-- çalıştırın: migration 062'nin kurduğu düzenin bozulup bozulmadığını söyler.
--
-- Beklenen çıktı: tek satır, durum = 'GECTI'.

with
-- 1) RLS açık olmayan tablolar
rls_yok as (
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
),

-- 2) anon/authenticated'a kalmış yetkiler
kalan_yetki as (
  select distinct grantee || ':' || table_name as x
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
),

-- 3) RLS'i baypas eden görünümler
--    security_invoker KAPALI bir görünüm, sahibinin (postgres) yetkileriyle
--    çalışır ve altındaki tabloların RLS'ini atlar. Herkese açık bir anahtarla
--    okunabiliyorsa bu doğrudan veri sızıntısıdır.
sizdiran_gorunum as (
  select c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
    and coalesce((select option_value from pg_options_to_table(c.reloptions)
                  where option_name = 'security_invoker'), 'false') not in ('true','on')
),

-- 4) search_path'i sabitlenmemiş fonksiyonlar
gevsek_fonksiyon as (
  select p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg like 'search_path=%')
),

-- 5) Beklenmedik şekilde POLİTİKA tanımlanmış tablolar
--    Bu şemada politika olmaması bir tasarım kararı (bkz. migration 062).
--    Politika belirmesi, birinin Supabase panelinden elle eklediği anlamına
--    gelir ve varsayılan-RED duruşunu delebilir.
beklenmedik_politika as (
  select tablename || '.' || policyname as x
  from pg_policies where schemaname = 'public'
)

select
  case when (select count(*) from rls_yok) = 0
        and (select count(*) from kalan_yetki) = 0
        and (select count(*) from sizdiran_gorunum) = 0
        and (select count(*) from gevsek_fonksiyon) = 0
        and (select count(*) from beklenmedik_politika) = 0
       then 'GECTI' else 'KALDI' end                                    as durum,
  coalesce((select string_agg(relname, ', ') from rls_yok), '-')        as "RLS kapali tablolar",
  coalesce((select string_agg(x, ', ') from kalan_yetki), '-')          as "anon/auth yetkisi kalanlar",
  coalesce((select string_agg(relname, ', ') from sizdiran_gorunum),'-') as "RLS baypas eden gorunumler",
  coalesce((select string_agg(proname, ', ') from gevsek_fonksiyon),'-') as "search_path sabitlenmemis",
  coalesce((select string_agg(x, ', ') from beklenmedik_politika), '-')  as "beklenmedik politikalar";
