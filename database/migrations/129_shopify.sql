-- 129_shopify.sql
-- Shopify entegrasyonu — Faz 1: sipariş, müşteri ve ödeme Shopify'dan Projelio'ya
--
-- NE İÇİN
-- -------
-- Shopify'da satış yapan bir şirket mağazasını bağlar; oradaki siparişler
-- Müşteriler > Tahsilat ekranına, ödemeler kasaya kendiliğinden düşer.
-- Ayrı bir "Shopify geliri" defteri AÇILMIYOR: sipariş musteri_siparisleri'ne,
-- ödeme musteri_tahsilatlari'na yazılır ve kasa satırını migration 128'deki
-- tahsilat bağı üretir. İkinci bir defter çift sayımı geri getirirdi
-- (bkz. migration 104'ün gerekçesi).
--
-- YÖN TEK: Shopify → Projelio. Projelio'dan Shopify'a hiçbir şey yazılmıyor;
-- iki yönlü eşitleme çakışma çözümü ister ve ilk sürümün kapsamı dışında.
--
-- ÜÇ PARÇA
-- --------
-- shopify_magazalari   — bağlı mağaza: alan adı, ŞİFRELİ erişim jetonu, sorumlu
-- shopify_olaylari     — webhook kuyruğu. Shopify yanıtı 5 saniyede bekliyor,
--                        gecikirse yeniden deniyor ve sonunda aboneliği
--                        siliyor; bu yüzden olay önce buraya yazılır, 200
--                        döner, işleme arkada yapılır.
-- musteri_siparisleri  — kaynak + dis_kimlik: aynı Shopify siparişi ikinci kez
--                        açılmasın, orders/updated mevcut satırı bulsun.

-- ============================================================ 1. Mağazalar

create table if not exists public.shopify_magazalari (
  id                    uuid primary key default gen_random_uuid(),
  -- Faz 1'de yalnızca şirket kapsamı. Serbest çalışanın işi (job) Faz 2.
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  -- "magaza.myshopify.com" — mağazanın DEĞİŞMEYEN adı. Özel alan adı
  -- (magaza.com) değişebilir, webhook'lar her zaman bununla gelir.
  shop_domain           varchar not null,
  magaza_adi            varchar,
  para_birimi           varchar(3),
  -- AES-256-GCM, anahtar SHOPIFY_TOKEN_ENC_KEY (bkz. common/crypto/token-crypto.ts).
  -- Mağaza kaldırılınca null'a çekilir: kullanılamayan jetonu saklamanın
  -- tek sonucu sızıntı riskidir.
  access_token_enc      text,
  scopes                varchar,
  durum                 varchar not null default 'aktif'
    check (durum in ('aktif', 'kaldirildi')),
  -- Shopify siparişinde satış temsilcisi yok; yeni açılan müşteri kartı bu
  -- kişiye atanır. Boşsa mağazayı bağlayan kişi üstlenir — sahipsiz müşteri
  -- kimsenin takip etmediği müşteridir.
  varsayilan_sorumlu_id uuid references public.users(id) on delete set null,
  baglayan_id           uuid references public.users(id) on delete set null,
  baglandi_at           timestamp not null default current_timestamp,
  kaldirildi_at         timestamp,
  son_olay_at           timestamp,
  -- Son işleme hatası — ayarlar kartında gösterilir. Yoksa "bağlı" görünen
  -- ama hiçbir sipariş düşmeyen bir mağazanın sebebi hiçbir yerde görünmezdi.
  son_hata              text,
  created_at            timestamp not null default current_timestamp
);

-- Bir mağaza TEK şirkete bağlanır: webhook yalnızca mağaza adıyla geliyor,
-- iki şirkete bağlı olsaydı siparişin hangisine yazılacağı belirsiz kalırdı.
-- Kaldırılmış bağlantılar indekste yok: mağaza başka bir şirkete taşınabilsin.
create unique index if not exists shopify_magazalari_domain_aktif_uniq
  on public.shopify_magazalari(shop_domain) where durum = 'aktif';
create index if not exists shopify_magazalari_org_idx on public.shopify_magazalari(organization_id);

alter table public.shopify_magazalari enable row level security;

comment on table public.shopify_magazalari is
  'Bagli Shopify magazasi. Jeton sifreli (SHOPIFY_TOKEN_ENC_KEY). shop_domain aktif satirlarda tekil: bir magaza tek sirkete yazar.';

-- ============================================================ 2. Webhook kuyruğu

create table if not exists public.shopify_olaylari (
  id            uuid primary key default gen_random_uuid(),
  -- Mağaza satırı silinse de olay kaydı kalsın (hangi alan adından geldiği
  -- shop_domain'de zaten yazılı).
  magaza_id     uuid references public.shopify_magazalari(id) on delete set null,
  shop_domain   varchar not null,
  konu          varchar not null,
  -- X-Shopify-Webhook-Id. Shopify aynı olayı birden çok kez gönderebilir
  -- (yanıt geç kaldığında ya da ağ koptuğunda); ikincisi burada düşer.
  webhook_id    varchar not null,
  govde         jsonb not null,
  durum         varchar not null default 'bekliyor'
    check (durum in ('bekliyor', 'islendi', 'hata', 'atlandi')),
  deneme        integer not null default 0,
  hata          text,
  alindi_at     timestamp not null default current_timestamp,
  islendi_at    timestamp
);

create unique index if not exists shopify_olaylari_webhook_uniq on public.shopify_olaylari(webhook_id);
create index if not exists shopify_olaylari_bekleyen_idx
  on public.shopify_olaylari(alindi_at) where durum = 'bekliyor';

alter table public.shopify_olaylari enable row level security;

comment on table public.shopify_olaylari is
  'Shopify webhook kuyrugu. Govde musteri kisisel verisi tasir; islenen olaylar 30 gun sonra silinir (ShopifyProcessor).';

-- ============================================================ 3. Sipariş kaynağı

alter table public.musteri_siparisleri
  add column if not exists kaynak varchar not null default 'elle';
alter table public.musteri_siparisleri drop constraint if exists musteri_siparisleri_kaynak_check;
alter table public.musteri_siparisleri
  add constraint musteri_siparisleri_kaynak_check check (kaynak in ('elle', 'shopify'));

-- Dış sistemdeki kimlik (Shopify sipariş id'si). Shopify id'leri tüm
-- mağazalar arasında tekil, bu yüzden indeks kaynak + kimlik üzerinde yeterli.
alter table public.musteri_siparisleri add column if not exists dis_kimlik varchar;
alter table public.musteri_siparisleri
  add column if not exists shopify_magaza_id uuid references public.shopify_magazalari(id) on delete set null;

create unique index if not exists musteri_siparisleri_dis_kimlik_uniq
  on public.musteri_siparisleri(kaynak, dis_kimlik) where dis_kimlik is not null;

comment on column public.musteri_siparisleri.kaynak is
  'elle = kullanici girdi; shopify = webhook ile geldi (dis_kimlik = Shopify siparis id).';
