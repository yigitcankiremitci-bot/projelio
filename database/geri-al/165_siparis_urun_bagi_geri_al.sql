-- 165_siparis_urun_bagi geri alma. Siparişler kalır; yalnızca ürün bağı gider.
drop index if exists public.musteri_siparisleri_product_idx;
alter table public.musteri_siparisleri drop column if exists product_id;
