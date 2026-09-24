-- 132_shopify_jeton_yenileme.sql
-- Shopify: süresi dolan çevrimdışı jetonlar (expiring offline access tokens)
--
-- NEDEN: Shopify yeni public uygulamalarda süresiz jetonu kabul etmiyor.
-- Kod takasında `expiring=1` isteniyor ve dönen jeton 1 SAAT geçerli; yanında
-- 90 günlük bir yenileme jetonu geliyor. Yenileme jetonu her kullanıldığında
-- YENİSİ verilir ve eskisi emekliye ayrılır (rotation) — yani yenisini
-- saklamayı unutan kod bir sonraki yenilemede 401 alır ve mağaza sessizce
-- kopar.
--
-- 129'da yalnızca erişim jetonu tutuluyordu (süresiz varsayımıyla). Hiçbir
-- mağaza henüz bağlanmadı; mevcut satır yok, geri uyum gerekmiyor.
--
-- Sipariş webhook'ları jetona BAĞLI DEĞİL (Shopify gönderir, biz yalnızca
-- imzayı doğrularız). Jeton API çağrıları için: webhook kaydı, bağlantıyı
-- kaldırma ve Faz 2'deki geçmiş aktarımı. Bu yüzden yenileme jetonu 90 gün
-- kullanılmazsa ölür — ShopifyProcessor her gece süresi yaklaşanları yeniler.

alter table public.shopify_magazalari add column if not exists refresh_token_enc text;
alter table public.shopify_magazalari add column if not exists access_token_expires_at timestamp;
alter table public.shopify_magazalari add column if not exists refresh_token_expires_at timestamp;

comment on column public.shopify_magazalari.refresh_token_enc is
  'Sifreli yenileme jetonu (SHOPIFY_TOKEN_ENC_KEY). Her yenilemede DEGISIR; eskisi gecersizlesir.';
