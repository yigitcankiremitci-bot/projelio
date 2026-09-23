-- 130_ekip_hesaplari.sql
-- Ekip Hesapları: şirket sahibinin (ya da departman yöneticisinin) ekibi için
-- doğrudan hesap açması.
--
-- NE İÇİN
-- -------
-- Bugüne kadar ekibe birini katmanın tek yolu davetti: kişi önce kendisi
-- kayıt oluyor, e-postasını doğruluyor, kurulum sihirbazından geçiyor, sonra
-- daveti kabul ediyordu. Yönetici için beş adım, çalışan için bir "ne
-- yapmam gerekiyor" belirsizliği. Burada yönetici formu doldurur; hesap,
-- kadro kaydı ve modül atamaları TEK işlemde açılır, çalışana giden
-- e-postadaki bağlantı onu doğrudan içeri alır.
--
-- ÜÇ PARÇA
-- --------
-- ekip_hesaplari        — "bu hesabı şu şirket açtı" kaydı. Yöneticinin
--                         listesi buradan gelir; "bağlantıyı yeniden gönder"
--                         yalnızca buradaki (henüz giriş yapılmamış) hesaplara
--                         açıktır — yöneticinin rastgele bir kullanıcı adına
--                         giriş bağlantısı üretememesi için.
-- giris_baglantilari    — e-postadaki tek kullanımlık giriş bağlantısı. Token
--                         düz saklanmaz (sha256), şifre sıfırlamayla aynı desen.
-- users.sifre_degistirmeli — yöneticinin belirlediği şifre kişinin kendi şifresi
--                         değil. İşaretliyse ilk girişte kendi şifresini
--                         belirlemesi istenir.
--
-- MODÜL KATALOĞU
-- --------------
-- Yönetim departmanına bağlı; İK'da da görünür (işe alımın doğal devamı).
-- Mevcut organizasyonlarda OTOMATİK AÇILMIYOR (078/106'daki gerekçe): yeni bir
-- seçenek, bir göçün hedefi değil. Yönetici katalogdan açar.

alter table public.users
  add column if not exists sifre_degistirmeli boolean not null default false;

comment on column public.users.sifre_degistirmeli is
  'Hesabi baskasi (ekip yoneticisi) acti ve sifreyi o belirledi. true ise ilk giriste kisiden kendi sifresini belirlemesi istenir; belirleyince false olur.';

create table if not exists public.ekip_hesaplari (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  created_by       uuid references public.users(id) on delete set null,
  -- E-postaya eklenen kısa karşılama notu (isteğe bağlı).
  karsilama_notu   text,
  davet_gonderildi_at timestamp,
  -- Bağlantıyla İLK giriş. Doluysa hesap artık kişinin kendisinindir:
  -- yönetici yeni giriş bağlantısı üretemez (kişi "şifremi unuttum"u kullanır).
  ilk_giris_at     timestamp,
  created_at       timestamp not null default current_timestamp,

  unique (organization_id, user_id)
);

comment on table public.ekip_hesaplari is
  'Ekip Hesaplari modulunden acilan hesaplar: hangi sirket, kim acti, ilk giris yapildi mi.';

create index if not exists ekip_hesaplari_org_idx on public.ekip_hesaplari(organization_id);
alter table public.ekip_hesaplari enable row level security;

create table if not exists public.giris_baglantilari (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  varchar not null unique,
  expires_at  timestamp not null,
  used_at     timestamp,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamp not null default current_timestamp
);

comment on table public.giris_baglantilari is
  'E-postadaki tek kullanimlik giris baglantisi (Ekip Hesaplari). token_hash = sha256(token); duz token saklanmaz.';

create index if not exists giris_baglantilari_user_idx on public.giris_baglantilari(user_id);
alter table public.giris_baglantilari enable row level security;

insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('ekip_hesaplari', 'yonetim', 'Ekip Hesapları',
   'Ekibin için Projelio hesabı aç: ad, kullanıcı adı, e-posta, şifre, görev, departman ve görebileceği modüller tek formda. Çalışana giden e-postadaki bağlantı onu doğrudan hesabına sokar.',
   'organization', false, 15)
on conflict (key) do nothing;

insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values
  ('ekip_hesaplari', 'yonetim',          true,  15),
  ('ekip_hesaplari', 'insan_kaynaklari', false, 15)
on conflict (module_key, department_key) do nothing;
