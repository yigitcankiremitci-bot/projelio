-- 170 geri alma: özel sıralar silinir; müşteri listeleri de silinir (üyelikleriyle),
-- bağlantı listeleri yerinde kalır.
drop table if exists public.party_ozel_siralar;
delete from public.baglanti_listeleri where modul <> 'baglantilar';
drop index if exists public.baglanti_listeleri_ad_uniq;
create unique index if not exists baglanti_listeleri_ad_uniq
  on public.baglanti_listeleri (coalesce(organization_id, job_id), lower(trim(ad)));
alter table public.baglanti_listeleri drop constraint if exists baglanti_listeleri_modul_chk;
alter table public.baglanti_listeleri drop column if exists modul;
