-- 074_urun_detaylari_ve_fotograflari.sql
--
-- Ürün/hizmet kaydını "ad + açıklama + fiyat"tan çıkarıp gerçek bir ürün
-- kartına dönüştürür ve ürüne ÇOKLU fotoğraf ekler.
--
-- NEDEN. products tablosu 025'te bir katalog satırı olarak kurulmuştu: bir
-- kapak görseli, bir fiyat. Ürünü satan/stoklayan biri için bu yetmiyor —
-- stok kodu, birim, KDV, maliyet, marka gibi alanlar açıklama metnine
-- sıkıştırılıyordu ve tek kapak görseli ürünün yalnızca bir yüzünü
-- gösterebiliyordu.
--
-- FOTOĞRAF NEDEN AYRI TABLO. Ürünün kaç fotoğrafı olacağı önceden bilinmiyor
-- ve sıraları kullanıcı tarafından değiştirilebilir olmalı. jsonb bir dizi
-- yerine satırlar: sıralama (sort_order) ve tekil silme sade kalıyor, ayrıca
-- depolama yolu (storage_path) her görselle birlikte tutulduğu için kovadaki
-- nesne silinebiliyor.
--
-- cover_image_url KALDIRILMADI. Kart bileşenleri (ProductCard) ve arşiv
-- listeleri tek bir URL okuyor; galeri geldi diye hepsinin sorgu şeklini
-- değiştirmek yerine bu sütun "vitrin görseli"nin denormalize kopyası olarak
-- kalıyor. Servis, sort_order = 0 olan fotoğrafı buraya yazmakla yükümlü
-- (bkz. ProductsService.syncCoverFromImages).

-- ---------------------------------------------------------------------------
-- 1) Ürün alanları
-- ---------------------------------------------------------------------------

alter table public.products
  -- Kimlik/sınıflandırma
  add column if not exists sku            varchar(64),
  add column if not exists barcode        varchar(64),
  add column if not exists brand          varchar(120),
  add column if not exists category       varchar(120),

  -- Ölçü ve stok. stock_quantity numeric: "2.5 kg" ya da "1.5 saat" gibi
  -- tam sayı olmayan miktarlar da tutulabilsin.
  add column if not exists unit           varchar(24),
  add column if not exists stock_quantity numeric(12,2),

  -- Para. price (satış fiyatı) 025'ten beri var; maliyet ve KDV yeni.
  -- tax_rate ORAN olarak yüzde tutulur (20 = %20), tutar olarak değil:
  -- fiyat değişince yeniden hesaplanması gerekmesin.
  add column if not exists cost_price     numeric(12,2),
  add column if not exists tax_rate       numeric(5,2),

  -- 'active' = satışta, 'inactive' = katalogda ama satış dışı.
  -- archived_at'ten AYRI: arşiv "listeden kaldır" demek, status ise ürün
  -- listede dururken satışa kapalı olmasıdır.
  add column if not exists status         varchar(16) not null default 'active',

  -- Ürünün tanıtım/satış sayfası. Adres güvenliği uygulama katmanında
  -- doğrulanır (bkz. backend/src/common/safe-url.ts) — javascript: gibi
  -- şemalar kaydedilmez.
  add column if not exists product_url    varchar(2048),

  -- Yalnızca şirket içi görünen serbest not (tedarikçi, raf yeri, uyarı…).
  add column if not exists notes          text;

alter table public.products
  drop constraint if exists products_status_check;
alter table public.products
  add constraint products_status_check check (status in ('active', 'inactive'));

comment on column public.products.tax_rate is
  'KDV orani YUZDE olarak (20 = %20). Tutar degil.';
comment on column public.products.status is
  'active = satista, inactive = katalogda ama satis disi. archived_at''ten ayridir.';

-- Aynı organizasyon içinde stok kodu tekrar etmesin. Kısmi indeks: sku boş
-- bırakılabilir ve boş bırakan onlarca ürün birbiriyle çakışmamalı.
create unique index if not exists products_org_sku_uniq
  on public.products(organization_id, sku)
  where sku is not null and sku <> '';

-- ---------------------------------------------------------------------------
-- 2) Ürün fotoğrafları
-- ---------------------------------------------------------------------------

create table if not exists public.product_images (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products(id) on delete cascade,

  -- Kovadaki nesnenin herkese açık adresi (getPublicUrl çıktısı).
  url          varchar(2048) not null,

  -- Kovadaki yol (`<urun-id>/<uuid>.<uzanti>`). Fotoğraf silinince nesnenin de
  -- silinebilmesi için tutuluyor; URL'den geri çözmek kova adı değişirse kırılır.
  -- 025'ten kalma kapaklarda NULL olabilir (aşağıdaki aktarım URL'den türetiyor,
  -- türetemezse null bırakıyor) — o durumda satır silinir, nesne kovada kalır.
  storage_path varchar(1024),

  -- 0 = vitrin görseli. Kullanıcı sıralamayı değiştirebilir.
  sort_order   integer not null default 0,

  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamp not null default current_timestamp
);

comment on table public.product_images is
  'Bir urunun fotograflari. sort_order = 0 olan vitrin gorselidir ve products.cover_image_url ile ayni tutulur.';

create index if not exists product_images_product_idx
  on public.product_images(product_id, sort_order);

alter table public.product_images enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Mevcut kapakları galeriye aktar
-- ---------------------------------------------------------------------------
--
-- Kapağı olan her ürün, o kapağı ilk fotoğrafı olarak devralır; aksi halde
-- galeri açıldığında mevcut kapak yokmuş gibi görünürdü.
--
-- storage_path, herkese açık URL'in ".../product-covers/" sonrasından
-- türetiliyor. Beklenmedik bir adres biçiminde split_part boş dönerse
-- nullif ile NULL'a çevriliyor: yanlış bir yolu silmeye kalkmaktansa nesneyi
-- kovada bırakmak yeğdir.
--
-- 'preset:...' DEĞERLERİ DIŞARIDA. cover_image_url her zaman bir adres değil:
-- hazır kapak kütüphanesinden seçim yapıldığında 'preset:<anahtar>' yazılıyor
-- (bkz. apps/web/src/lib/covers.ts). Bunlar kovada bir nesneye karşılık
-- gelmiyor; galeriye taşınırlarsa <img src="preset:sis"> gibi kırık bir
-- görsel olarak çizilirlerdi.

insert into public.product_images (product_id, url, storage_path, sort_order, created_at)
select
  p.id,
  p.cover_image_url,
  nullif(split_part(p.cover_image_url, '/product-covers/', 2), ''),
  0,
  p.created_at
from public.products p
where p.cover_image_url is not null
  and p.cover_image_url <> ''
  and p.cover_image_url not like 'preset:%'
  and not exists (select 1 from public.product_images i where i.product_id = p.id);
