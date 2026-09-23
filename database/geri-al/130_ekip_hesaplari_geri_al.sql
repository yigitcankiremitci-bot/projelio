-- 130_ekip_hesaplari.sql geri alma.
-- Açılmış HESAPLAR SİLİNMEZ: kişiler artık gerçek kullanıcı, kadro ve modül
-- kayıtları duruyor. Yalnızca modül ve onun kendi tabloları kalkar.

delete from public.module_catalog_departments where module_key = 'ekip_hesaplari';
delete from public.organization_modules where module_key = 'ekip_hesaplari';
delete from public.module_catalog where key = 'ekip_hesaplari';
drop table if exists public.giris_baglantilari;
drop table if exists public.ekip_hesaplari;
alter table public.users drop column if exists sifre_degistirmeli;
