-- 120 — Canlı demo randevuları
--
-- Projelio'yu 40 dakikalık online görüşmeyle tanıtıyoruz. Randevuyu iki kişi
-- alabilir:
--   · üye olmayan ziyaretçi — herkese açık /demo-randevu sayfasından; adını,
--     e-postasını ve telefonunu bırakır;
--   · üye — Ayarlar > Yardımcılar'dan; bilgileri hesabından gelir.
--
-- Bloklar yöneticinin girdiği çalışma saatlerinden üretilir (ziyaretçi 10:17
-- gibi serbest bir saat seçemez). Randevu gelince yöneticilere e-posta gider;
-- yönetici görüşmeyi kendine ya da bir moderatöre (demo_sunuculari) atar.

-- ───────────────────────────────────────────── Ayarlar (tek satır)
create table if not exists public.demo_ayarlari (
  id                         boolean primary key default true check (id),
  -- Varsayılan KAPALI: çalışma saatleri girilmeden sayfa boş takvim göstermesin.
  aktif                      boolean not null default false,
  sure_dk                    integer not null default 40 check (sure_dk between 10 and 240),
  tampon_dk                  integer not null default 10 check (tampon_dk between 0 and 120),
  min_onceden_saat           integer not null default 12 check (min_onceden_saat between 0 and 336),
  max_gun_ileri              integer not null default 21 check (max_gun_ileri between 1 and 120),
  saat_dilimi                text not null default 'Europe/Istanbul',
  varsayilan_toplanti_linki  text,
  bildirim_epostalari        text[] not null default '{}',
  updated_at                 timestamp not null default current_timestamp,
  updated_by                 uuid references public.users(id) on delete set null
);

insert into public.demo_ayarlari (id) values (true) on conflict do nothing;

-- Bir güne birden fazla aralık girilebilir (ör. 10:00-12:00 ve 14:00-17:00).
create table if not exists public.demo_calisma_saatleri (
  id          uuid primary key default gen_random_uuid(),
  gun         smallint not null check (gun between 1 and 7),
  baslangic   time not null,
  bitis       time not null,
  constraint demo_calisma_saatleri_sira check (bitis > baslangic)
);

create table if not exists public.demo_kapali_gunler (
  tarih     date primary key,
  aciklama  text
);

-- ───────────────────────────────────────────── Moderatörler
--
-- Rol sistemine YENİ ROL EKLENMEDİ: users.role'e 'moderator' koymak onu her
-- yetki kontrolünde düşünülmesi gereken bir şeye çevirirdi. Moderatörün tek
-- yetkisi kendisine atanan demoları görmek ve sonucunu işaretlemek; bunun için
-- bu listede olması yetiyor. Yöneticiler listede olmasa da görev alabilir.
create table if not exists public.demo_sunuculari (
  user_id          uuid primary key references public.users(id) on delete cascade,
  -- Sunucunun kendi görüşme odası (kişisel Meet/Zoom). Boşsa ayardaki varsayılan.
  toplanti_linki   text,
  -- Otomatik Google Meet: sunucu KENDİ Google hesabıyla takvim izni verir,
  -- her randevu onun takviminde bir etkinlik + ayrı bir Meet odası olarak
  -- açılır. Bu bağlantı Drive/giriş hesaplarından (google_accounts) AYRI
  -- tutuluyor: takvim izni geniş bir izin, yalnızca demo yapan birkaç kişide
  -- olmalı ve Drive bağlantısını kesmek onu etkilememeli.
  google_eposta          text,
  -- GOOGLE_TOKEN_ENC_KEY ile şifreli (bkz. google/token-crypto.util.ts).
  google_refresh_token   text,
  google_baglandi_at     timestamptz,
  created_at       timestamp not null default current_timestamp
);

-- ───────────────────────────────────────────── Randevular
create table if not exists public.demo_randevulari (
  id                 uuid primary key default gen_random_uuid(),
  baslangic          timestamptz not null,
  bitis              timestamptz not null,
  durum              varchar(12) not null default 'bekliyor'
                       check (durum in ('bekliyor', 'planlandi', 'tamamlandi', 'gelmedi', 'iptal')),
  kaynak             varchar(12) not null check (kaynak in ('herkese_acik', 'ayarlar')),
  -- Üye aldıysa dolu. Üye olmayan sonradan aynı adresle hesap açarsa
  -- Ayarlar kartı ilk açılışta bağlar (bkz. DemoRandevuService.benim).
  user_id            uuid references public.users(id) on delete set null,
  ad                 text not null,
  eposta             text not null,
  telefon            text,
  sirket             text,
  ekip_buyuklugu     text,
  talep_notu         text,
  dil                varchar(5) not null default 'tr',
  sunucu_id          uuid references public.users(id) on delete set null,
  toplanti_linki     text,
  -- Bağlantı sunucunun Google takviminde otomatik açıldıysa etkinliğin kimliği
  -- ve sahibi: saat değişince etkinlik taşınır, iptalde silinir, görev başka
  -- birine verilince eskisinin takviminden kalkar. Elle yazılan bağlantıda boş.
  google_etkinlik_id     text,
  google_etkinlik_sahibi uuid references public.users(id) on delete set null,
  ic_not             text,
  -- Herkese açık yönetim bağlantısı (iptal / yeniden planla). E-postadaki
  -- adresi bilen randevuyu yönetebilir; 192 bit, tahmin edilemez.
  yonetim_token      text not null unique,
  -- .ics SEQUENCE: saat ya da bağlantı değişince artar ki takvim uygulaması
  -- eski etkinliğin üstüne yazsın, ikinci bir kopya açmasın.
  takvim_sirasi      integer not null default 0,
  iptal_nedeni       text,
  iptal_eden         varchar(10) check (iptal_eden in ('katilimci', 'yonetici')),
  hatirlatma_gun_at  timestamptz,
  hatirlatma_saat_at timestamptz,
  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp not null default current_timestamp,
  constraint demo_randevulari_sira check (bitis > baslangic)
);

-- AYNI BLOĞA İKİ RANDEVU olmasın — veritabanı düzeyinde. İki ziyaretçi aynı
-- saniyede aynı bloğa basarsa uygulamadaki "boş mu?" kontrolünü ikisi de
-- geçer; ikincisini bu indeks reddeder ve kullanıcıya "bu saat az önce doldu"
-- denir. İptal edilen ve geçmişte kalan randevular yeri bırakır.
create unique index if not exists demo_randevulari_blok_uniq
  on public.demo_randevulari (baslangic)
  where durum in ('bekliyor', 'planlandi');

create index if not exists demo_randevulari_eposta_idx on public.demo_randevulari (lower(eposta));
create index if not exists demo_randevulari_user_idx on public.demo_randevulari (user_id);
create index if not exists demo_randevulari_sunucu_idx on public.demo_randevulari (sunucu_id);
-- Hatırlatma işleyicisinin taradığı küme: yalnızca yaklaşan etkin randevular.
create index if not exists demo_randevulari_hatirlatma_idx
  on public.demo_randevulari (baslangic)
  where durum in ('bekliyor', 'planlandi');

drop trigger if exists trg_demo_randevulari_updated_at on public.demo_randevulari;
create trigger trg_demo_randevulari_updated_at
  before update on public.demo_randevulari
  for each row execute function public.set_updated_at();

comment on table public.demo_randevulari is
  'Canli demo gorusmeleri. Uye olmayanin kisisel verisi (ad, e-posta, telefon) yalnizca bu gorusmeyi planlamak icin tutulur.';
