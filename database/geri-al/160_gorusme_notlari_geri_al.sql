-- 160_gorusme_notlari geri alma. 'ulasilamadi' satırları önce 'arama'ya çevrilir,
-- yoksa eski kısıt eklenemez.
update public.party_activity set type = 'arama' where type = 'ulasilamadi';
alter table public.party_activity drop constraint if exists party_activity_type_check;
alter table public.party_activity
  add constraint party_activity_type_check
  check (type in ('not', 'arama', 'toplanti', 'eposta', 'teklif', 'ziyaret', 'sistem'));
alter table public.party drop column if exists sonraki_arama;
