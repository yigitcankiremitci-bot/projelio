-- 153_baglantilar.sql
-- Bağlantı ve İlişkiler modülü: müşteri olmayan dış kişiler (rakip, olası
-- işbirlikçi, fuarda tanışılan meslektaş).
--
-- Yeni bir kişi tablosu AÇILMIYOR: kayıtlar `party`'de duruyor. Bugünün
-- bağlantısı yarın müşteri olur; ayrı tabloda aynı kişi iki yerde ayrı ayrı
-- eskirdi, WhatsApp/Lio/içe aktarma/yinelenen kontrolü baştan yazılırdı.
--
-- Ama Müşteriler listesine de KARIŞMIYORLAR. `party.modules` kaydın hangi
-- modülün defterinde durduğunu söyler: Bağlantılar'da açılan kart
-- Müşteriler'de görünmez, "Müşteri yap" denince iki defterde birden görünür.
-- Rol ("ne olduğu") ile defter ("kimin listesinde olduğu") ayrı sorular:
-- rakip bir firma tedarikçimiz de olabilir ama yalnızca yönetimin
-- defterinde durabilir.
--
-- Bkz. docs/moduller/17-modul-baglantilar.md

-- ─────────────────────────────────────────────── party.modules

-- Varsayılan crm_musteri: mevcut bütün kayıtlar Müşteriler'de kalır, bugünkü
-- davranış değişmez. Shopify gibi kodun party'ye doğrudan yazan yolları da
-- bu varsayılanla müşteri defterine düşer.
alter table public.party
  add column if not exists modules text[] not null default '{crm_musteri}';

comment on column public.party.modules is
  'Kaydin goruldugu moduller (crm_musteri, baglantilar). Okuma yetkisi bu modullerden HERHANGI birinden gelir; liste uclari modul anahtarina gore suzer. Rol (roles) ile karistirma: rol kaydin ne oldugu, bu alan kimin defterinde oldugu.';

create index if not exists party_modules_idx on public.party using gin(modules);

-- ─────────────────────────────────────────────── party_baglanti

-- Yalnızca Bağlantılar'a ait alanlar. party.data ya da party.notes'a
-- yazılmıyor: kart müşteriye dönüşünce satış ekibi o alanları okur.
-- "Rakip, fiyatları bizden düşük" notu satışçıya açılmamalı; ayrı tabloda
-- dururken yalnızca `baglantilar` okuma yetkisi olana döner. Önem ve sonraki
-- temas sıralanıp süzülsün diye gerçek sütun, jsonb değil.
create table if not exists public.party_baglanti (
  party_id         uuid primary key references public.party(id) on delete cascade,
  onem             varchar(10) not null default 'orta' check (onem in ('yuksek', 'orta', 'dusuk')),
  tanisma_yeri     varchar(200),
  tanisma_tarihi   date,
  sonraki_temas    date,
  iliski_notu      text,
  updated_at       timestamp not null default current_timestamp
);

comment on table public.party_baglanti is
  'Baglanti ve Iliskiler modulunun party kaydina ekledigi alanlar. Yalnizca baglantilar modulunun yetkisiyle okunur/yazilir (PartyService).';

create index if not exists party_baglanti_sonraki_temas_idx
  on public.party_baglanti(sonraki_temas) where sonraki_temas is not null;

-- RLS açık, politika yok: erişim yalnızca PartyService üzerinden.
alter table public.party_baglanti enable row level security;

-- ─────────────────────────────────────────────── Katalog

-- Birincil departman Satış ve İş Geliştirme; Pazarlama ve Yönetim'den de
-- eklenebilir. Departmanlar aynı kayıtlara bakar (party ortak varlık).
insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('baglantilar', 'satis_is_gelistirme', 'Bağlantı ve İlişkiler',
   'Müşteri olmayan dış bağlantıları tek yerde toplar: fuarda tanışılan kişiler, rakipler, olası işbirlikçiler. Önem sırası, nerede tanışıldığı ve bir sonraki temas tarihiyle takip edilir; müşteriye dönüşen kart Müşteriler''e taşınmadan geçer.',
   'organization', true, 12)
on conflict (key) do nothing;

insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values
  ('baglantilar', 'satis_is_gelistirme', true,  12),
  ('baglantilar', 'pazarlama_buyume',    false, 12),
  ('baglantilar', 'yonetim',             false, 12)
on conflict (module_key, department_key) do nothing;
