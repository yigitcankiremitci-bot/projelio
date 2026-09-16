-- 115_sosyal_katkida_bulunanlar geri alma.
-- DİKKAT: publish_via kalkınca harici planlanmış gönderiler yeniden Projelio
-- kuyruğuna girebilir (durumları "planlandı" ise ve hedeflerine saat yazılırsa).
-- Geri almadan önce o gönderileri taslağa çekin ya da yayımlandı işaretleyin.
drop table if exists public.social_post_collaborators;
alter table public.social_posts drop column if exists external_tool;
alter table public.social_posts drop column if exists publish_via;
