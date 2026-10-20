-- 168_satis_kanallari_ve_siparis_kalemleri geri alma.
--
-- DİKKAT: müşterisiz (kanal) siparişler party_id NOT NULL'a geri dönülemeyeceği
-- için SİLİNİR — tahsilatları ve kasadaki gelir satırları da cascade ile gider.
-- Çalıştırmadan önce `select count(*) from musteri_siparisleri where party_id is null`
-- ile ne gideceğine bak. Excel'den yüklenen siparişler (kaynak = 'excel') de
-- kaynak kısıtı daraldığı için silinir.

begin;

delete from public.musteri_siparisleri where party_id is null or kaynak = 'excel';

drop table if exists public.musteri_siparis_kalemleri;

alter table public.musteri_siparisleri drop constraint if exists musteri_siparis_sahip_chk;
drop index if exists public.musteri_siparisleri_kanal_idx;
alter table public.musteri_siparisleri drop column if exists kanal_id;
alter table public.musteri_siparisleri drop column if exists alici_adi;
alter table public.musteri_siparisleri drop column if exists alici_il;
alter table public.musteri_siparisleri drop column if exists alici_ilce;
alter table public.musteri_siparisleri alter column party_id set not null;

alter table public.musteri_siparisleri drop constraint if exists musteri_siparisleri_kaynak_check;
alter table public.musteri_siparisleri
  add constraint musteri_siparisleri_kaynak_check check (kaynak in ('elle', 'shopify'));

drop table if exists public.satis_kanallari;

commit;
