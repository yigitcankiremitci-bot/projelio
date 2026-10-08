-- 156_party_kurum_turu geri alma. 'institution' kartları önce şirkete çevrilir
-- (kısıt yoksa geri alma o satırlarda patlardı).
update public.party set party_type = 'company' where party_type = 'institution';
alter table public.party drop constraint if exists party_party_type_check;
alter table public.party
  add constraint party_party_type_check check (party_type in ('person', 'company'));
