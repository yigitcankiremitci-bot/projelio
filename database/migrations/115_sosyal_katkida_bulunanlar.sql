-- 115_sosyal_katkida_bulunanlar.sql
-- Sosyal Medya: katkıda bulunan hesaplar + "yayını kim yapıyor"
--
-- İKİ EKSİK, TEK KULLANIM SENARYOSU
-- ---------------------------------
-- Bir Reels üç hesabın ortak gönderisi olarak çıkıyor (Instagram'ın
-- "katkıda bulunanlar" / collab özelliği): kişisel hesap yayımlıyor, şirket
-- ve stüdyo hesapları ortak yazar olarak görünüyor. Modülde bunun karşılığı
-- yoktu; ortaklık açıklama metnine not olarak düşülüyor, takvimde
-- görünmüyordu.
--
-- Aynı gönderiler çoğu zaman Projelio'da değil, Meta Business Suite'te
-- zamanlanıyor. Projelio'ya "planlandı" diye işlendiklerinde yayın kuyruğu
-- (social-publish.processor) saatleri gelince onları KENDİSİ yayımlamaya
-- çalışıyordu: bağlı hesapta aynı video ikinci kez çıkardı, elle yönetilen
-- hesapta da her gönderi için "yayımlanamadı" bildirimi düşerdi.
--
--   social_posts.publish_via       projelio | external
--   social_posts.external_tool     "Meta Business Suite" gibi serbest ad
--   social_post_collaborators      gönderi × katkıda bulunan hesap
--
-- Migration uygulanmadan önceki davranış aynen sürer: varsayılan 'projelio'.

-- ---------------------------------------------------------------------------
-- 1) Yayını kim yapıyor
-- ---------------------------------------------------------------------------

alter table public.social_posts
  add column if not exists publish_via varchar not null default 'projelio'
    check (publish_via in ('projelio', 'external'));

alter table public.social_posts
  add column if not exists external_tool varchar;

comment on column public.social_posts.publish_via is
  'projelio: zamanlanmis gonderiyi Projelio kuyrugu yayimlar. external: baska bir aracta (ör. Meta Business Suite) planlandi; kuyruk dokunmaz, kayit takvim ve takip icindir.';

-- Harici planlanmış bir gönderinin hedeflerinde kuyruk saati kalmamalı.
-- Kolon yeni olduğu için bugün böyle satır yok; yine de kural veritabanında
-- da dursun diye mevcut veriyi hizalıyoruz (boş çalışır).
update public.social_post_targets t
   set publish_at = null
  from public.social_posts p
 where p.id = t.post_id
   and p.publish_via = 'external'
   and t.publish_at is not null;

-- ---------------------------------------------------------------------------
-- 2) Katkıda bulunanlar
-- ---------------------------------------------------------------------------
-- Hesap modülde kayıtlıysa account_id dolar (takvimde hesabın rengi, adı
-- oradan gelir); kayıtlı değilse yalnızca kullanıcı adı yeter — ortak
-- gönderi yapılan her hesabı modüle eklemek zorunlu olmasın.
--
-- handle HER ZAMAN yazılır: hesap sonradan arşivlense ya da silinse bile
-- "bu gönderi kimlerle ortak çıktı" bilgisi kaybolmasın.
--
-- Platform ayrı tutuluyor, çünkü davet platforma gidiyor: Instagram'daki
-- @pist.istanbul ile Facebook'taki Pist sayfası farklı kimlikler.

create table if not exists public.social_post_collaborators (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.social_posts(id) on delete cascade,
  account_id   uuid references public.social_accounts(id) on delete set null,
  platform     varchar not null default 'instagram'
                 check (platform in ('instagram','facebook','x','linkedin','tiktok',
                                     'youtube','pinterest','threads','blog','other')),
  handle       varchar not null,
  -- Davet karşı hesapta kabul edilmeden ortak gönderi görünmüyor; kimin
  -- onaylamadığı takip edilebilsin.
  status       varchar not null default 'invited'
                 check (status in ('invited','accepted','declined')),
  sort_order   integer not null default 0,
  created_at   timestamp not null default current_timestamp
);

comment on table public.social_post_collaborators is
  'Gonderinin katkida bulunan (ortak yazar) hesaplari. handle her zaman dolu; account_id hesap modulde kayitliysa.';

-- Aynı hesap aynı gönderiye iki kez eklenmesin. Kullanıcı adı büyük/küçük
-- harf duyarsız ve "@" öneksiz saklanıyor (servis normalize ediyor).
create unique index if not exists social_post_collaborators_uniq
  on public.social_post_collaborators (post_id, platform, lower(handle));

create index if not exists social_post_collaborators_post_idx
  on public.social_post_collaborators (post_id, sort_order);

create index if not exists social_post_collaborators_account_idx
  on public.social_post_collaborators (account_id)
  where account_id is not null;

-- Diğer modül tabloları gibi: RLS açık, politika yok; erişim yalnızca
-- SocialMediaService üzerinden (service_role).
alter table public.social_post_collaborators enable row level security;
