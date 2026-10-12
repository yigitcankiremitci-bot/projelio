-- Müşteri siparişini ürün/hizmet kataloğuna bağlar.
--
-- Şimdiye kadar "ne satıldı" yalnızca serbest metindi (aciklama); ürün
-- kartı bir ürünün kime, ne kadar satıldığını ve tahsilatını göremiyordu.
-- Bağ İSTEĞE BAĞLI: eski siparişler ve katalogda olmayan satışlar metinle
-- kalır, aciklama da silinmez (aynı ürünün farklı tarifi olabilir).
--
-- Ürün silinirse sipariş GİTMEZ, yalnızca bağ kopar (set null): satılmış
-- malın kaydı ve tahsilatı katalogdan bağımsız olarak gerçektir.
--
-- Ürünün siparişin şirketine ait olması sunucuda doğrulanır
-- (SiparisService.urunuCoz); iş kapsamındaki müşterilerin siparişleri
-- bağlanamaz — katalog şirketindir.

alter table public.musteri_siparisleri
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists musteri_siparisleri_product_idx
  on public.musteri_siparisleri(product_id) where product_id is not null;

comment on column public.musteri_siparisleri.product_id is
  'Satilan urun/hizmet (istege bagli). Urun silinince bag kopar, siparis kalir.';
