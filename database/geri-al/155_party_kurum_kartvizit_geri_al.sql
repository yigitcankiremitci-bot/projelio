-- 155_party_kurum_kartvizit geri alma. Kurum/unvan bilgisi SİLİNİR; kartvizit
-- dosyaları Drive'da kalır ama kartla bağları kopar.
delete from public.file_links where target_kind = 'party';
alter table public.file_links drop constraint if exists file_links_target_kind_check;
alter table public.file_links
  add constraint file_links_target_kind_check
  check (target_kind in ('task', 'user', 'module_record', 'project'));
alter table public.party drop column if exists kurum, drop column if exists unvan;
