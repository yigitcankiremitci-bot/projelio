-- 157_party_dosya_rolu.sql
-- Kişi/kurum kartındaki dosyalar ikiye ayrılır: KARTVİZİT ve EK DOSYA
-- (teklif, katalog, sunum…). İkisi de file_links'te target_kind = 'party'.
--
-- Rol bağın üstünde, dosyanın değil: aynı dosya bir kartta kartvizit,
-- başka bir kartta ek olabilir (Lio tek fotoğraftaki kartvizitleri herkese
-- bağlıyor). Klasör adına bakarak ayırmak kırılgandı — kullanıcı dosyayı
-- Drive'da taşıyabiliyor.
--
-- Diğer hedef türlerinde (görev, kişi, modül kaydı, proje) rol boş kalır.

alter table public.file_links
  add column if not exists party_rol text check (party_rol in ('kartvizit', 'ek'));

comment on column public.file_links.party_rol is
  'Yalnizca target_kind = party: kartvizit | ek. Bos kayitlar (157 oncesi) kartvizit sayilir.';

update public.file_links set party_rol = 'kartvizit' where target_kind = 'party' and party_rol is null;
