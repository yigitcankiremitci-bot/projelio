-- 164_sosyal_kapak.sql
-- Sosyal Medya: içerik kapağı (reels kapak görseli)
--
-- Kullanıcılar reels kapağını Projelio'da seçemediği için gönderiyi
-- yayımladıktan sonra Instagram uygulamasına girip kapağı elle
-- değiştiriyordu. Meta tekil video (REELS) konteynerinde `cover_url` alıyor;
-- kapağı burada tutup yayın anında oraya veriyoruz.
--
-- Kapak bir MEDYA değil: karusel sırasına girmez, Lio önerisinde kare
-- sayılmaz, gönderiden kaldırılınca dosya yerinde kalır. Bu yüzden
-- social_post_media'ya bir bayrak değil, gönderide ayrı bir kolon.
--
-- Dosya silinirse kapak sessizce boşalır (on delete set null): yayın
-- kapaksız çıkar, Meta videonun ilk karesini kullanır — hata vermekten iyi.
--
-- Migration uygulanmadan önce kod kolonu yalnızca kapak seçildiğinde yazar;
-- kapak hiç kullanılmazsa eski davranış aynen sürer.

alter table public.social_posts
  add column if not exists cover_file_id uuid references public.files(id) on delete set null;

comment on column public.social_posts.cover_file_id is
  'Reels kapak gorseli (JPEG). Yayin aninda Instagram''a cover_url olarak verilir; karuselde kullanilmaz (orada kapak ilk medyadir).';
