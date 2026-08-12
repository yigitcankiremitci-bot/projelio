-- 044_restore_organization_modules_unique.sql
-- 042'de kaldırılan (organization_id, module_key) tekilliğini geri getirir.
--
-- HATA NEYDİ:
--   042, "aynı modül birden fazla departmanda etkinleştirilebilsin" diye
--   organization_modules_organization_id_module_key_key kısıtını kaldırıp
--   yerine coalesce(department_id, ...)'lu üç kolonlu bir ifade indeksi koydu.
--
--   Ancak organization-modules.service.ts modül etkinleştirmeyi şöyle yapıyor:
--       .upsert(..., { onConflict: "organization_id,module_key", ignoreDuplicates: true })
--
--   Postgres'te ON CONFLICT hedefi TAM olarak belirtilen kolonlarda bir unique
--   index ister; ifade indeksi bu hedefi karşılamaz. Kısıt kaldırıldığı anda
--   "Modül ekle" akışı çalışmaz hale geldi.
--
-- KARAR:
--   Tekillik geri geliyor. Çoklu departman desteği şema tarafında tek başına
--   anlamlı değil — kod tarafı (module_catalog_departments, etkinleştirme
--   akışının departman göndermesi) hazır olduğunda, Faz 3'te birlikte gelecek.
--
--   organization_modules.department_id kolonu DURUYOR: eklenmesi geriye dönük
--   uyumlu ve zararsız, module_records ile tutarlılığı sağlıyor.
--
-- Bkz. docs/moduller/05-mevcut-kod-ile-uzlasma.md

drop index if exists public.organization_modules_org_module_dept_uniq;

alter table public.organization_modules
  add constraint organization_modules_organization_id_module_key_key
  unique (organization_id, module_key);
