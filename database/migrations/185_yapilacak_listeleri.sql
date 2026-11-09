-- 185_yapilacak_listeleri.sql
--
-- Yapılacaklar listeleri (kullanıcı isteği, 2026-11-09): kişi yapılacaklarını
-- "Ev", "Fuar hazırlığı" gibi adlandırılmış listelerde toplar. Kanban sayfasının
-- ve anasayfa kartının üstünde sekme olarak görünür.
--
-- Oynatma listesi modeli (bağlantı listeleriyle aynı, bkz. migration 163): bir
-- kart birden çok listede olabilir, listeden çıkmak kartı silmez. Üyelik hem
-- kişisel kartları hem kişiye ATANMIŞ görevleri taşır; bu yüzden `oge_id`'ye
-- yabancı anahtar yok — kaynak `kaynak` sütununda ('personal' → personal_todos,
-- 'assigned' → tasks). Kart silinince kalan üyelik satırı zararsızdır: pano
-- yalnızca görünen kartların üyeliğini okur.
--
-- Listeler kişiye özeldir (atanan görev ekipte ortak olsa da kişinin listesi
-- kimseye görünmez). İzolasyon personal_todos gibi servis katmanında
-- (personal-todos/yapilacak-listeleri.service.ts): her sorgu user_id ile.

create table if not exists public.yapilacak_listeleri (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ad text not null check (char_length(btrim(ad)) between 1 and 60),
  sira integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists yapilacak_listeleri_user_idx on public.yapilacak_listeleri (user_id, sira);

create table if not exists public.yapilacak_liste_uyeleri (
  liste_id uuid not null references public.yapilacak_listeleri(id) on delete cascade,
  kaynak text not null check (kaynak in ('personal', 'assigned')),
  oge_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (liste_id, kaynak, oge_id)
);

create index if not exists yapilacak_liste_uyeleri_oge_idx on public.yapilacak_liste_uyeleri (kaynak, oge_id);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı (bkz. 062, 184).
alter table public.yapilacak_listeleri enable row level security;
alter table public.yapilacak_liste_uyeleri enable row level security;
