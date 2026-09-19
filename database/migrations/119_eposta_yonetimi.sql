-- 119 — E-posta yönetimi: admin'in düzenlediği ipuçları, toplu/tekil gönderim,
-- Lio ile kişiselleştirme ve maliyet defteri
--
-- 118 ipucu dizisini KODDA sabit tutuyordu. Yönetici artık:
--   · ipuçlarını panelden düzenleyip kapatabiliyor, sırasını değiştirebiliyor,
--     kendi ipucunu ekleyebiliyor;
--   · tek bir kullanıcıya ya da bir kitleye (herkes, yeni üyeler, uzun süredir
--     girmeyenler) e-posta gönderebiliyor;
--   · her iki durumda da Lio'dan metni HER ALICI İÇİN AYRI yazmasını
--     isteyebiliyor. Sebep teslim edilebilirlik: yüzlerce kişiye birebir aynı
--     gövde gitmesi spam süzgeçlerinin baktığı işaretlerden biri; ayrıca
--     kişinin adıyla, diliyle ve hesabının durumuyla konuşan metin okunuyor.
--
-- LIO MALİYETİ KİMSENİN BAKİYESİNDEN DÜŞMEZ: bu e-postaları kullanıcı
-- istemedi, işletme gönderiyor. Harcama ayrı bir deftere (eposta_ai_kullanimi)
-- yazılıyor ve admin panelinde Lio Bakiyesi karşılığıyla (birim) görünüyor —
-- "bu kampanya kaç birime mal oldu" sorusu, kullanıcıların harcadığı
-- birimle aynı ölçüyle cevaplansın diye.

-- ───────────────────────────────────────────── İpuçları
--
-- KODDAKİ İPUÇLARI VARSAYILAN OLARAK KALIR (backend ipucu.icerik.ts): hem
-- İngilizce çevirileri orada, hem de tablo boşken sistem aynen çalışmalı.
-- Bir satır ya kodaki bir ipucunun ÜSTÜNE yazar (`kod` dolu; metin alanları
-- boşsa koddaki metin geçerli) ya da yöneticinin eklediği yeni bir ipucudur
-- (`kod` boş, metin zorunlu).
create table if not exists public.eposta_ipuclari (
  id          uuid primary key default gen_random_uuid(),
  kod         varchar(60) unique,
  sira        integer not null default 0,
  aktif       boolean not null default true,
  -- Her alıcıya Lio'nun yeniden yazdığı bir metin gitsin mi.
  lio_ile     boolean not null default false,
  baslik      text,
  govde       text,
  link        text,
  dugme       text,
  created_at  timestamp not null default current_timestamp,
  updated_at  timestamp not null default current_timestamp,
  updated_by  uuid references public.users(id) on delete set null,

  constraint eposta_ipuclari_ozel_metinli
    check (kod is not null or (baslik is not null and govde is not null))
);

comment on table public.eposta_ipuclari is
  'Ipucu e-postalarinin yonetici ayarlari. kod dolu = koddaki ipucunun ustune yazar; kod bos = yoneticinin ekledigi ipucu.';

drop trigger if exists trg_eposta_ipuclari_updated_at on public.eposta_ipuclari;
create trigger trg_eposta_ipuclari_updated_at
  before update on public.eposta_ipuclari
  for each row execute function public.set_updated_at();

-- Kime hangi ipucu gitti. İlerleme SAYAÇ DEĞİL bu kayıt: yönetici araya ipucu
-- eklediğinde ya da sırayı değiştirdiğinde sayaç yanlış ipucunu gösterirdi.
-- Sıradaki ipucu = sıradaki aktif ipuçlarından bu kişiye henüz gitmemiş ilki.
create table if not exists public.ipucu_gonderimleri (
  user_id         uuid not null references public.users(id) on delete cascade,
  -- kod (koddaki ipucu) ya da eposta_ipuclari.id (yöneticinin eklediği)
  ipucu_anahtari  varchar(60) not null,
  gonderildi_at   timestamp not null default current_timestamp,
  lio_ile         boolean not null default false,
  primary key (user_id, ipucu_anahtari)
);

-- ───────────────────────────────────────────── Kampanyalar
--
-- Tekil gönderim de bir kampanyadır (tek alıcılı): geçmiş, maliyet ve durum
-- tek yerde görünsün. Gönderim kuyruktan yapılıyor çünkü Lio ile yazılan
-- metin alıcı başına birkaç saniye sürüyor — 300 kişilik bir kampanya istek
-- içinde bitemez.
create table if not exists public.eposta_kampanyalari (
  id            uuid primary key default gen_random_uuid(),
  tur           varchar(10) not null default 'toplu' check (tur in ('toplu', 'tekil')),
  konu          text not null,
  baslik        text not null,
  govde         text not null,
  link          text,
  dugme         text,
  lio_ile       boolean not null default false,
  -- Kitle tanımı: {"tur":"herkes"} · {"tur":"yeni","gun":14} · {"tur":"pasif","gun":7} · {"tur":"secili"}
  hedef         jsonb not null default '{"tur":"secili"}'::jsonb,
  durum         varchar(15) not null default 'bekliyor'
                  check (durum in ('bekliyor', 'gonderiliyor', 'bitti', 'iptal')),
  alici_sayisi  integer not null default 0,
  gonderilen    integer not null default 0,
  basarisiz     integer not null default 0,
  atlanan       integer not null default 0,
  olusturan     uuid references public.users(id) on delete set null,
  created_at    timestamp not null default current_timestamp,
  bitti_at      timestamp
);

create index if not exists idx_eposta_kampanyalari_bekleyen
  on public.eposta_kampanyalari (created_at)
  where durum in ('bekliyor', 'gonderiliyor');

create table if not exists public.eposta_kampanya_alicilari (
  kampanya_id   uuid not null references public.eposta_kampanyalari(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  durum         varchar(12) not null default 'bekliyor'
                  check (durum in ('bekliyor', 'gonderildi', 'basarisiz', 'atlandi')),
  hata          text,
  gonderildi_at timestamp,
  primary key (kampanya_id, user_id)
);

create index if not exists idx_eposta_kampanya_alicilari_bekleyen
  on public.eposta_kampanya_alicilari (kampanya_id)
  where durum = 'bekliyor';

-- ───────────────────────────────────────────── Lio maliyet defteri
create table if not exists public.eposta_ai_kullanimi (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamp not null default current_timestamp,
  -- ipucu: otomatik ipucu · kampanya: toplu/tekil gönderim · taslak: yöneticiye
  -- taslak yazdırma · onizleme: gönderim öncesi örnek
  islem           varchar(12) not null check (islem in ('ipucu', 'kampanya', 'taslak', 'onizleme')),
  kampanya_id     uuid references public.eposta_kampanyalari(id) on delete set null,
  ipucu_anahtari  varchar(60),
  alici_user_id   uuid references public.users(id) on delete set null,
  admin_user_id   uuid references public.users(id) on delete set null,
  model           varchar(120) not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  maliyet_usd     numeric(12, 6) not null default 0,
  -- Aynı harcama bir kullanıcıdan kesilseydi kaç birim tutardı (komisyon dahil).
  birim           numeric(12, 2) not null default 0,
  basarili        boolean not null default true
);

create index if not exists idx_eposta_ai_kullanimi_tarih on public.eposta_ai_kullanimi (created_at desc);
create index if not exists idx_eposta_ai_kullanimi_kampanya on public.eposta_ai_kullanimi (kampanya_id);

-- ───────────────────────────────────────────── Genel ayarlar (tek satır)
create table if not exists public.eposta_ayarlari (
  id                      smallint primary key default 1 check (id = 1),
  -- Otomatik ipucu turunun ana anahtarı. Kapalıyken kimseye ipucu gitmez.
  ipuclari_acik           boolean not null default true,
  -- Otomatik ipuçlarında Lio'nun bir günde harcayabileceği en fazla birim.
  -- Aşılınca o gün kalan ipuçları Lio'suz (düz metin) gider — kaçak bir
  -- döngünün faturayı büyütmesine karşı. Null = sınırsız.
  lio_gunluk_tavan_birim  numeric(12, 2) default 5000,
  updated_at              timestamp not null default current_timestamp,
  updated_by              uuid references public.users(id) on delete set null
);

insert into public.eposta_ayarlari (id) values (1) on conflict (id) do nothing;

-- ───────────────────────────────────────────── Doğrulama hatırlatması
--
-- Adresini doğrulamamış kişi GİRİŞ YAPAMIYOR (auth.service.ts). Kayıttaki tek
-- doğrulama e-postası spam'e düşer ya da gözden kaçarsa hesap sonsuza kadar
-- kilitli kalıyordu — üstelik EMAIL_FROM tanımsızken gönderilenler hiç
-- ulaşmamıştı. Günde bir hatırlatma gidiyor, SINIRLI sayıda: doğrulanmamış
-- adres çoğu zaman yanlış yazılmış bir adres ve oraya sonsuza dek göndermek
-- geri dönen e-postalarla gönderen itibarını düşürür.
alter table public.users
  add column if not exists dogrulama_hatirlatma_sayisi smallint not null default 0,
  add column if not exists son_dogrulama_hatirlatma_at timestamp;

comment on column public.users.dogrulama_hatirlatma_sayisi is
  'Hesabi onayla hatirlatmasi kac kez gonderildi. Tavana gelince durur (bkz. dogrulama-hatirlatma.ts).';

-- RLS: proje genelindeki desen — açık ama policy yok, erişim yalnızca service_role.
alter table public.eposta_ipuclari           enable row level security;
alter table public.ipucu_gonderimleri        enable row level security;
alter table public.eposta_kampanyalari       enable row level security;
alter table public.eposta_kampanya_alicilari enable row level security;
alter table public.eposta_ai_kullanimi       enable row level security;
alter table public.eposta_ayarlari           enable row level security;
revoke all on public.eposta_ipuclari, public.ipucu_gonderimleri, public.eposta_kampanyalari,
  public.eposta_kampanya_alicilari, public.eposta_ai_kullanimi, public.eposta_ayarlari
  from anon, authenticated;
