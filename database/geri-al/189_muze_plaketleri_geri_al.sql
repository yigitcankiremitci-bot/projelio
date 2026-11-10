-- 189_muze_plaketleri geri alma.
-- DİKKAT: tablo düşürülünce müzedeki TÜM plaketler kaybolur ve geri basılamaz
-- (bitiş anındaki kopyalar başka hiçbir yerde yok). Önce yedek al:
--   pg_dump -t public.muze_plaketleri ...

drop trigger if exists muze_proje_bitti on public.projects;
drop trigger if exists muze_kisi_anonimlesti on public.users;
drop function if exists public.muze_proje_bitti();
drop function if exists public.muze_kisi_anonimlesti();
drop function if exists public.muze_plaket_bas(uuid, timestamptz, boolean);

drop table if exists public.muze_plaketleri;
drop function if exists public.muze_plaketi_degismez();
drop function if exists public.muze_plaketi_bosaltilamaz();
