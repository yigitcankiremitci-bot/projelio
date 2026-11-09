-- 184_veritabani_izin_onarimi.sql
--
-- 062'nin kurduğu "varsayılan RED" düzeni zamanla delinmiş; 2026-11-09 tarihli
-- denetim (scripts/db-izin-denetimi.sql) KALDI dedi: 18 tabloda RLS kapalı,
-- yaklaşık 85 tabloda anon/authenticated yetkisi kalmış, job_folders görünümü
-- RLS'i atlıyor, 12 fonksiyonda search_path sabit değil.
--
-- Neden delindi: 062 varsayılan yetkileri yalnızca adı `postgres` ve
-- `supabase_admin` olan roller için kapatıyordu. Kendi sunucumuza göçten sonra
-- tabloları açan rol için kapatılmamış kaldı, her yeni tablo açık doğdu.
-- Aşağıda rol adı yazılmıyor; veritabanında gerçekten kayıtlı olana bakılıyor.
--
-- Uygulamayı etkilemez: backend service_role (BYPASSRLS) ile bağlanır. Tasarım
-- gerekçesi için 062'nin başlığına bak; RLS politikası bilerek YOK.
--
-- IDEMPOTENT: tekrar çalıştırılabilir, tablo adı yazılmadığı için yeni açıkları da kapatır.

-- 1) Her tabloda RLS (FORCE bilerek yok, bkz. 062).
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    raise notice 'RLS acildi: %', t.relname;
  end loop;
end $$;

-- 2) anon/authenticated yetkileri. service_role'a dokunulmuyor.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 3) Yeni nesneler de kapalı doğsun: asıl kalıcı düzeltme burası.
--    Önce migration'ı çalıştıran rol, sonra kayıtlı her varsayılan.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

do $$
declare
  r record;
  hedef text;
begin
  for r in
    select pg_get_userbyid(d.defaclrole) as rol, d.defaclobjtype as tip
    from pg_default_acl d
    where d.defaclnamespace = 'public'::regnamespace
      and d.defaclobjtype in ('r', 'S', 'f')
      and exists (
        select 1 from aclexplode(d.defaclacl) a
        where a.grantee in ('anon'::regrole, 'authenticated'::regrole)
      )
  loop
    hedef := case r.tip when 'r' then 'tables' when 'S' then 'sequences' else 'functions' end;
    begin
      execute format(
        'alter default privileges for role %I in schema public revoke all on %s from anon, authenticated',
        r.rol, hedef);
      raise notice 'Varsayilan yetki kapatildi: % / %', r.rol, hedef;
    exception when insufficient_privilege then
      -- Migration'ı düşürmesin; migrate.sh sonundaki denetim kalanı söyler.
      raise notice 'Varsayilan yetki degistirilemedi: % / %', r.rol, hedef;
    end;
  end loop;
end $$;

-- 4) Görünümler çağıranın yetkisiyle çalışsın, sahibininkiyle RLS'i atlamasın.
do $$
declare
  v record;
begin
  for v in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and coalesce((select option_value from pg_options_to_table(c.reloptions)
                    where option_name = 'security_invoker'), 'false') not in ('true', 'on')
  loop
    execute format('alter view public.%I set (security_invoker = on)', v.relname);
    raise notice 'security_invoker acildi: %', v.relname;
  end loop;
end $$;

-- 5) Fonksiyonlarda search_path sabit olsun (gerekçe 062 bölüm 4).
--    Eklentiye ait fonksiyonlar atlanır; onların sahibi eklentidir.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as imza
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.imza);
    raise notice 'search_path sabitlendi: %', f.imza;
  end loop;
end $$;
