-- 155_party_kurum_kartvizit.sql
-- Bağlantı kartına (1) kişinin çalıştığı kurum ve unvanı, (2) kartvizit dosyası.
--
-- KURUM neden serbest metin, parent_party_id değil: fuarda kişinin şirketi
-- çoğu zaman sistemde kayıtlı değil. Önce firma kartı açtırmak 40 kartviziti
-- 80 kayda çevirirdi. parent_party_id (kayıtlı firmaya bağ) ayrıca duruyor;
-- ikisi çelişmez — kurum, kartın üstünde okunan addır.
--
-- KARTVİZİT dosyası file_links ile bağlanıyor (migration 095'in deseni):
-- dosya kapsamın dosya ağacında ("Kartvizitler" klasörü) durur, karta yalnızca
-- bağ yazılır. Klasör modülün açık olduğu DEPARTMANIN klasörüdür, şirketinki
-- değil: şirket klasörü bütün kadroya açık ve rakiplerin kartvizitleri herkesin
-- Dosyalar ekranında görünürdü (Bağlantılar'ın görünürlük kararı, 153).

alter table public.party
  add column if not exists kurum varchar(200),
  add column if not exists unvan varchar(150);

comment on column public.party.kurum is
  'Kisinin calistigi sirket/kurum (serbest metin). Kayitli firma karti varsa ayrica parent_party_id.';
comment on column public.party.unvan is
  'Kisinin gorevi/unvani (Pazarlama Muduru). legal_name ile karistirma: o kurumun resmi unvani.';

alter table public.file_links drop constraint if exists file_links_target_kind_check;
alter table public.file_links
  add constraint file_links_target_kind_check
  check (target_kind in ('task', 'user', 'module_record', 'project', 'party'));
