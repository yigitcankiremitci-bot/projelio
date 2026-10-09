-- 158_baglanti_etkinligi.sql
-- Kullanıcının şu an bulunduğu etkinlik (fuar): Lio'ya bir kez söylenir,
-- bitişine kadar gönderilen her kartvizite "nerede tanışıldı" ve tarih
-- kendiliğinden yazılır.
--
-- NEDEN: fuarda 40 kartvizit atan kullanıcı her birinde "İTS 2026'da
-- tanıştık" yazıyordu; hem yorucu hem her soru-cevap turu Lio Bakiyesi
-- harcıyor (kullanıcı geri bildirimi, 2026-10-09).
--
-- Kullanıcı başına TEK satır: aynı anda iki fuarda olunmuyor; yeni etkinlik
-- eskisinin üstüne yazılır. Bellekte değil tabloda: her dağıtım sunucuyu
-- yeniden başlatıyor ve fuar ortasında etkinliğin unutulması tam da
-- kaçınılmak istenen soruyu geri getirirdi.

create table if not exists public.baglanti_etkinlikleri (
  user_id        uuid primary key references public.users(id) on delete cascade,
  -- Boş olabilir: kullanıcı yalnızca "sormadan kaydet" istemiş, etkinlik adı vermemiş olabilir.
  tanisma_yeri   varchar(200),
  baslangic      date not null default current_date,
  bitis          date not null,
  -- Kullanıcı "hepsi bağlantı" dediyse rol de sorulmaz.
  varsayilan_rol varchar(20) check (varsayilan_rol in ('contact', 'competitor', 'collaborator', 'lead', 'supplier', 'distributor', 'other')),
  -- "Rolleri ve notları sonra eklerim": kartvizit okunur okunmaz kaydedilir,
  -- hiçbir şey sorulmaz (kartvizit başına tek Lio turu). Kullanıcının AÇIK
  -- isteğiyle ve yalnızca bitişe kadar; varsayılan kural taslağın kullanıcıya
  -- gösterilip onaylanmasıdır (bkz. ai-assistant/baglanti-taslaklari.ts).
  sormadan_kaydet boolean not null default false,
  updated_at     timestamp not null default current_timestamp,
  constraint baglanti_etkinlikleri_tarih_chk check (bitis >= baslangic)
);

comment on table public.baglanti_etkinlikleri is
  'Kullanicinin bulundugu etkinlik (fuar): bitisine kadar Lio kartvizitlere tanisma yerini kendisi yazar. Erisim yalnizca AiAssistantService uzerinden.';

alter table public.baglanti_etkinlikleri enable row level security;
