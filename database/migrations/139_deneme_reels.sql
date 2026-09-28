-- 139_deneme_reels.sql
-- Sosyal Medya: Instagram "deneme reels" (trial reels)
--
-- Deneme reels önce YALNIZCA takipçi olmayanlara gösterilir; hesap sahibi
-- videonun yeni kitlede nasıl karşılandığını görüp sonra takipçilerine açar
-- ("mezun eder"). Meta bunu yayın konteynerine `trial_params` olarak alıyor
-- ve iki mezuniyet yolu tanıyor:
--
--   manual       kullanıcı Instagram uygulamasından elle açar
--   performance  Meta ilk performansa bakıp kendisi açar (SS_PERFORMANCE)
--
-- NULL = normal gönderi. Değer Meta'nın adı değil kendi adımız: API'deki
-- adlandırma değişirse (daha önce "VIDEO"→"REELS" oldu) yalnızca yayın kodu
-- değişsin, veri değil.
--
-- Yalnızca TEK videolu Instagram gönderisinde anlamlı; karusel ve görselde
-- Meta parametreyi reddediyor. Bu kural yayın anında denetlenir (bkz.
-- publish-format.ts > denemeReelsHatasi), burada değil: kullanıcı önce
-- işaretleyip videoyu sonra ekleyebilmeli.
--
-- Migration uygulanmadan önce kod kolonu yazmıyor; eski davranış aynen sürer.

alter table public.social_posts
  add column if not exists trial_reel varchar
    check (trial_reel in ('manual', 'performance'));

comment on column public.social_posts.trial_reel is
  'Instagram deneme reels: manual (elle mezun edilir) | performance (Meta performansa gore acar) | NULL (normal gonderi).';
