-- 026_product_cover_bucket.sql
-- Ürün kapak fotoğrafları için depolama bucket'ı (bkz. 007_job_cover.sql deseni).

insert into storage.buckets (id, name, public)
values ('product-covers', 'product-covers', true)
on conflict (id) do nothing;
