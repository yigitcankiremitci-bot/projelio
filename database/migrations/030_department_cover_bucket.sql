-- 030_department_cover_bucket.sql
-- Departman kapak fotoğrafı: bkz. 026_product_cover_bucket.sql deseni.
-- department_catalog anahtarına göre varsayılan (default) kapaklar backend
-- tarafında sabit bir eşlemeyle sağlanır (bkz. DepartmentsService); bu kolon
-- yalnızca kullanıcının ÖZEL OLARAK yüklediği kapağı tutar — boşsa (null),
-- backend otomatik olarak o departmanın katalog anahtarına ait varsayılan
-- kapağı döner. Kullanıcı özel kapağı kaldırırsa bu kolon tekrar null'a döner
-- ve varsayılan kapak otomatik olarak geri gelir.
alter table public.departments add column if not exists cover_image_url varchar;

insert into storage.buckets (id, name, public)
values ('department-covers', 'department-covers', true)
on conflict (id) do nothing;
