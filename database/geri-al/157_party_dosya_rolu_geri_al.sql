-- 157_party_dosya_rolu geri alma. Ek dosyalar kartta kartvizit gibi görünmeye başlar.
alter table public.file_links drop column if exists party_rol;
