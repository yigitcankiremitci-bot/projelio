-- 166_siparis_faturasi geri alma. Fatura kayıtları ve belgeleri durur; yalnızca bağ gider.
drop index if exists public.musteri_siparisleri_invoice_uniq;
alter table public.musteri_siparisleri drop column if exists invoice_record_id;
