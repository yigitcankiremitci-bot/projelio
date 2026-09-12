-- 110_urun_karti_genisletme GERİ AL
--
-- DİKKAT: ürün türü, özellikler, teknik özellikler, garanti, teslim süresi,
-- kritik stok ve tedarikçi bağı KALICI olarak silinir. Bilerek çalıştır.

drop index if exists public.products_supplier_idx;

alter table public.products
  drop constraint if exists products_kind_check,
  drop constraint if exists products_features_array,
  drop constraint if exists products_specs_array;

alter table public.products
  drop column if exists supplier_party_id,
  drop column if exists min_stock,
  drop column if exists lead_time,
  drop column if exists warranty,
  drop column if exists specs,
  drop column if exists features,
  drop column if exists kind;
