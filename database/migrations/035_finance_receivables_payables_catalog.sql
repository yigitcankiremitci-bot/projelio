-- Şirket "Bütçe" sekmesindeki alacak/borç takibi için modül kataloğuna yeni bir
-- giriş ekler (bkz. fm_gelir_gider ile aynı desen, 024_departments_and_org_structure.sql).
-- module_records tablosu module_key -> module_catalog(key) referansı taşıdığı için
-- (028_module_records.sql), yeni bir moduleKey kullanmadan önce burada tanımlı olması
-- gerekiyor.

insert into public.module_catalog (key, department_key, name, scope, sort_order) values
('fm_alacak_borc', 'finans_muhasebe', 'Alacak-Borç Takibi', 'organization', 15)
on conflict (key) do nothing;
