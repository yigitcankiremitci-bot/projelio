-- 195: "Apple ile giriş" kimlikleri.
--
-- NEDEN: iPhone uygulamasında Google ile giriş sunulursa Apple eşdeğer bir
-- giriş seçeneği (Apple ile giriş) ister (App Store kuralı 4.8). Apple'ın
-- verdiği kimlik (`sub`) kişiye ve bizim ekip kimliğimize özgü, kalıcıdır;
-- e-posta ise kişi "e-postamı gizle" dediyse rastgele bir yönlendirme adresidir
-- (…@privaterelay.appleid.com) ve değişebilir. Bu yüzden eşleştirme e-postayla
-- değil `apple_sub` ile yapılır, e-posta yalnızca ilk bağlamada kullanılır.
--
-- Google/Microsoft tablolarından farkı: Apple'da depo yok, yenileme anahtarı
-- tutulmuyor; satır yalnızca bir giriş kimliği. Kullanıcı başına bir tane
-- (kullanıcının GİRİŞ kimliği tektir, bkz. GoogleAuthService).
--
-- Kullanıcı silinince satır da gider (on delete cascade).
--
-- IDEMPOTENT.

create table if not exists public.apple_hesaplari (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references public.users(id) on delete cascade,
  apple_sub   text not null unique,
  -- İlk bağlamadaki e-posta (yönlendirme adresi olabilir). Bilgi amaçlı.
  email       text,
  ozel_eposta boolean not null default false,
  created_at  timestamptz not null default now(),
  son_giris   timestamptz
);

-- Varsayılan-RED düzeni (migration 062): RLS açık, politika yok; sunucu
-- service role ile okur/yazar.
alter table public.apple_hesaplari enable row level security;
