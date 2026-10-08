-- 156_party_kurum_turu.sql
-- Kart türüne "kurum" (institution) eklenir: Kişi / Şirket / Kurum.
--
-- Eskiden iki tür vardı ve arayüz 'company'yi "Kurum" diye gösteriyordu.
-- Fuarda tanışılanların bir kısmı şirket değil: dernek, üniversite, belediye,
-- oda. Kullanıcı "Şirket" seçeneğini arayınca bulamıyordu; ikisi ayrı tür oldu.
-- Mevcut 'company' kayıtları şirket olarak kalır — veri değişmez.
--
-- Şirket ve kurum kartlarının altına birden fazla kişi (unvan, telefon,
-- e-posta) party_contact'ta zaten tutulabiliyor (046); yeni tablo yok.

alter table public.party drop constraint if exists party_party_type_check;
alter table public.party
  add constraint party_party_type_check check (party_type in ('person', 'company', 'institution'));
