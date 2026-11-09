-- 184'ün geri alınması. ELLE ve yalnızca 184 bir şeyi bozduysa çalıştırılır.
--
-- Yalnızca uygulamayı etkileyebilecek iki adımı geri alır: görünümün çalışma
-- biçimi ve fonksiyonların search_path'i. RLS ve anon/authenticated yetkileri
-- BİLEREK geri verilmiyor: backend service_role ile bağlandığı için hiçbir
-- şeyi bozamazlar, geri vermek yalnızca veritabanını yeniden açardı.

alter view public.job_folders reset (security_invoker);

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as imza
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'ai_available_credits', 'ai_release_credits', 'ai_reserve_credits', 'task_place_after',
        'ai_reverse_credit_transaction', 'ai_plan_payini_bitir', 'ai_grant_plan_credits',
        'ai_expire_plan_credits', 'admin_kullanici_etkinlik_ozeti', 'kullanici_etkinligi_isle',
        'ai_charge_credits', 'ai_add_plan_credits'
      )
  loop
    execute format('alter function %s reset search_path', f.imza);
  end loop;
end $$;
