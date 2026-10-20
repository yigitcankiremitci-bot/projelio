-- 169_modul_acilis_sekmesi.sql
-- Modülün açılış sekmesi, KULLANICI BAŞINA
--
-- NE İÇİN
-- -------
-- Müşteri modülü üç sekmeyle açılıyor (Tahsilat takibi · Müşteriler ·
-- Potansiyel). Muhasebeci her girişte tahsilatı, satışçı müşteri listesini
-- görmek istiyor: tercih kişisel. Hap sekmedeki ev simgesiyle kişi kendi
-- açılış sekmesini seçer (kullanıcı isteği, 2026-10-20). Seçmeyen için
-- varsayılan packages/shared/src/modulSekmeleri.ts'te.
--
-- NEDEN TARAYICIDA DEĞİL
-- ----------------------
-- 167'deki gerekçe: localStorage telefonla bilgisayar arasında taşınmıyor.
--
-- KAPSAM KİMLİĞİ FK'SIZ
-- ---------------------
-- kapsam_id şirketin ya da işin kimliği; iki tabloya birden FK verilemez ve
-- organizations↔users arasında İKİNCİ bir yol açmak PostgREST gömmesini
-- belirsizleştirir (167'de şirket listesi bu yüzden boş görünmüştü). Kapsam
-- silinirse satır anlamsızlaşır ama zararsızdır: okunurken kapsamın
-- yetkisi zaten soruluyor. Sekme anahtarları sunucuda süzülür; CHECK yok
-- (091'deki gerekçe: yeni sekme migration gerektirmesin).

create table if not exists public.modul_acilis_sekmesi (
  user_id     uuid not null references public.users(id) on delete cascade,
  kapsam_id   uuid not null,
  modul_key   varchar not null,
  sekme       varchar not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, kapsam_id, modul_key)
);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı.
alter table public.modul_acilis_sekmesi enable row level security;

comment on table public.modul_acilis_sekmesi is
  'Kullanicinin bir modulu hangi sekmeyle actigi (kapsam = sirket ya da is). Yoksa varsayilan: shared modulSekmeleri.ts.';
