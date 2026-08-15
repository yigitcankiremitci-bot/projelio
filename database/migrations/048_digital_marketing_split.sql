-- 048_digital_marketing_split.sql
-- "Dijital Pazarlama ve SEO/SEM" modülünün ikiye ayrılması (Karar 2).
--
-- SORUN:
--   pd_dijital_pazarlama_seo_sem tek başına iki farklı işi taşıyordu:
--     1. Anahtar kelime takibi — veri girişi (A2)
--     2. Kanal performans özeti — okuma (A6)
--   Tek modüle sığmıyordu; kullanıcı hangisini beklediğini bilemiyordu.
--
-- ÇÖZÜM:
--   pd_dijital_pazarlama_seo_sem  -> SEO/SEM anahtar kelime takibi (adı netleşti)
--   pd_dijital_pazarlama (YENİ)   -> tüm dijital kanalların performans paneli
--
-- Karar Ağustos'ta alınmıştı ve kod tarafı (seoSemConfig, digitalMarketingPanel)
-- yazılmıştı; katalog tarafı eksik kalmış. Panel bu kayıt olmadan hiçbir
-- departmanda görünmüyordu.
--
-- Bkz. docs/moduller/01-modul-arketip-eslesmesi.md Karar 2

-- Var olan kayıt yalnızca SEO/SEM işini üstleniyor; adı ve açıklaması netleşiyor.
update public.module_catalog
set name = 'SEO / SEM',
    description = 'Takip edilen anahtar kelimeleri hedef sayfası, arama hacmi ve sıralamasıyla izler.'
where key = 'pd_dijital_pazarlama_seo_sem';

-- Panel yarısı ayrı bir modül olarak ekleniyor.
insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('pd_dijital_pazarlama', 'pazarlama_buyume', 'Dijital Pazarlama',
   'Sosyal medya, e-posta, reklam ve SEO kanallarının performansını tek ekranda toplar. Veri girişi yoktur, okur (panel).',
   'organization', true, 25)
on conflict (key) do nothing;

insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values ('pd_dijital_pazarlama', 'pazarlama_buyume', true, 25)
on conflict (module_key, department_key) do nothing;
