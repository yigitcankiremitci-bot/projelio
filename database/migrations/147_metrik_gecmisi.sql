-- 147_metrik_gecmisi.sql
-- Sosyal Medya > Analiz > İlerleyiş: metriklerin ZAMAN İÇİNDEKİ hâli
--
-- 145 her gönderinin yalnızca SON metriklerini tutuyor (üzerine yazılıyor).
-- "Bu video ilk 24 saatte ne yaptı", "bu ay günde kaç izlenme kazandım",
-- "takipçim nasıl gidiyor" soruları ancak geçmiş saklanırsa cevaplanır.
--
--   social_media_metric_snapshots   gönderi × an: her metrik okumasında bir satır.
--                                   Yeni gönderiler ilk 72 saat saatte bir,
--                                   sonra gece senkronunda okunuyor.
--   social_account_snapshots        hesap × gün: takipçi ve gönderi sayısı.
--
-- Geçmiş bu migration'dan SONRA birikmeye başlar; Instagram geçmiş değerleri
-- vermiyor (yalnızca o anki toplamı). Grafikler ilk günlerde boş görünür ve
-- bunu söyler.
--
-- Boyut: hesap başına günde ~(taze gönderi × 24 + 60) satır; yıllık birkaç
-- on bin. Her satır birkaç tamsayı.
--
-- GÜVENLİK NOTU: diğer sosyal medya tablolarıyla aynı model — RLS açık,
-- politika yok, erişim yalnızca servis katmanından.

create table if not exists public.social_media_metric_snapshots (
  id                  bigserial primary key,
  media_id            uuid not null references public.social_account_media(id) on delete cascade,
  account_id          uuid not null references public.social_accounts(id) on delete cascade,
  captured_at         timestamp not null default (now() at time zone 'utc'),
  views               integer,
  reach               integer,
  like_count          integer,
  comments_count      integer,
  saved               integer,
  shares              integer,
  total_interactions  integer
);

create index if not exists social_media_metric_snapshots_media_idx
  on public.social_media_metric_snapshots (media_id, captured_at);
create index if not exists social_media_metric_snapshots_account_idx
  on public.social_media_metric_snapshots (account_id, captured_at);

alter table public.social_media_metric_snapshots enable row level security;

create table if not exists public.social_account_snapshots (
  account_id       uuid not null references public.social_accounts(id) on delete cascade,
  -- UTC günü: günde tek satır, aynı gün içindeki okumalar üzerine yazar.
  captured_on      date not null,
  follower_count   integer,
  media_count      integer,
  updated_at       timestamp not null default (now() at time zone 'utc'),
  primary key (account_id, captured_on)
);

alter table public.social_account_snapshots enable row level security;
