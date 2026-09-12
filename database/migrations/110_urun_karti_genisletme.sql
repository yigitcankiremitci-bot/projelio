-- 110_urun_karti_genisletme.sql
--
-- Ürün/hizmet kaydını "katalog satırı"ndan bir ÜRÜN KARTINA genişletir: ürünü
-- anlatmak, satmak ve tedarik etmek için gereken bilgiler tek yerde dursun.
--
-- NEDEN. 074 ürünü muhasebe gözüyle tamamlamıştı (stok kodu, KDV, maliyet).
-- Ama bir ürünü ya da hizmeti SATAN biri için asıl sorulan sorular hâlâ
-- açıklama metnine sıkışıyordu: "neler içeriyor, ölçüsü ne, garantisi kaç yıl,
-- ne kadar sürede teslim edilir, kimden alıyoruz, stok kaçın altına düşerse
-- sipariş verilir". Ürün kartı (ProductDetailModal) bu alanları ayrı ayrı
-- gösterir; metin içinde kaybolmazlar.
--
-- Strateji ve modül kayıtları BURAYA KOPYALANMAZ. Strateji
-- pd_urun_stratejileri kaydında (module_records.scope_ref = products.id),
-- tedarik/depo/kalite kayıtları kendi modüllerinde durur; ürün kartı onları
-- okuyup bir arada gösterir (bkz. ProductsService.overview). İki yerde tutulan
-- bilgi bir gün iki farklı şey söyler.

alter table public.products
  -- 'product' = fiziksel/dijital ürün, 'service' = hizmet. Kart, hizmette stok
  -- ve barkod gibi anlamsız alanları gizlemek için buna bakar; veri silinmez.
  add column if not exists kind             varchar(16) not null default 'product',

  -- Öne çıkan özellikler: sıralı kısa maddeler ("Su geçirmez", "2 yıl garanti").
  -- text[] değil jsonb: sıra korunmalı ve istemci diziyi olduğu gibi yazıyor.
  add column if not exists features         jsonb not null default '[]'::jsonb,

  -- Teknik özellikler: [{ "label": "Ağırlık", "value": "2,4 kg" }, …].
  -- Sütun sütun açılmadı: sandalyenin "oturma yüksekliği" ile yazılımın
  -- "lisans türü" aynı tabloya sütun olarak sığmaz.
  add column if not exists specs            jsonb not null default '[]'::jsonb,

  -- Serbest metin: "2 yıl", "Ömür boyu", "Yok" — süre birimi ürünle değişiyor.
  add column if not exists warranty         varchar(120),
  -- "3 iş günü", "Siparişten 2 hafta sonra" — hizmette teslim/başlama süresi.
  add column if not exists lead_time        varchar(120),

  -- Kritik stok seviyesi. Stok bu değere eşit ya da altındaysa kart uyarır.
  add column if not exists min_stock        numeric(12,2),

  -- Asıl tedarikçi. Ortak varlığa (party) bağlı: tedarikçinin telefonu ürün
  -- kartına kopyalanmaz, tek kayıttan okunur. Tedarikçi silinirse ürün kalır.
  add column if not exists supplier_party_id uuid references public.party(id) on delete set null;

alter table public.products
  drop constraint if exists products_kind_check;
alter table public.products
  add constraint products_kind_check check (kind in ('product', 'service'));

-- jsonb'nin DİZİ olduğu veritabanında da garanti: nesne yazılırsa kart
-- `.map` çağırırken kırılırdı.
alter table public.products
  drop constraint if exists products_features_array;
alter table public.products
  add constraint products_features_array check (jsonb_typeof(features) = 'array');
alter table public.products
  drop constraint if exists products_specs_array;
alter table public.products
  add constraint products_specs_array check (jsonb_typeof(specs) = 'array');

comment on column public.products.kind is
  'product = urun, service = hizmet. Hizmette stok/barkod alanlari arayuzde gizlenir.';
comment on column public.products.specs is
  'Teknik ozellikler: [{label, value}] dizisi.';
comment on column public.products.min_stock is
  'Kritik stok seviyesi; stok bu degere esit ya da altindaysa uyari gosterilir.';

create index if not exists products_supplier_idx
  on public.products(supplier_party_id) where supplier_party_id is not null;
