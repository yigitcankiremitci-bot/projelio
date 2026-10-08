-- 154_party_sosyal.sql
-- Kişi/kurum kartına sosyal medya hesapları (LinkedIn, Instagram, X…).
--
-- Fuar dönüşü bağlantı girerken istendi: kartvizitte web sitesi ve sosyal
-- hesaplar yazıyor, kişinin kim olduğunu çoğu zaman LinkedIn'i söylüyor.
--
-- party'de, party_baglanti'da DEĞİL: hesap adı gizli bir bilgi değil, kişinin
-- kendi yayımladığı iletişim bilgisi. Kart müşteriye dönüşünce satış ekibi de
-- görmeli (web sitesi zaten party.website'ta).
--
-- Biçim kartvizitle aynı (packages/shared/src/kartvizit.ts KARTVIZIT_SOSYAL):
-- { "linkedin": "in/ad-soyad", "instagram": "kullaniciadi" }. Adres değil
-- TUTAMAÇ saklanır; bağlantıyı arayüz tutamaçtan üretir, kullanıcının yazdığı
-- bir URL hiçbir zaman href'e olduğu gibi girmez.

alter table public.party
  add column if not exists sosyal jsonb not null default '{}'::jsonb;

comment on column public.party.sosyal is
  'Sosyal medya tutamaclari: { linkedin, instagram, x, youtube, tiktok, threads, facebook, github, behance }. Adres degil tutamac; dogrulama PartyService (kartvizitSosyalNormallestir).';
