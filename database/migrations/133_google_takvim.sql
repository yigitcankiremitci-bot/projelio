-- 133_google_takvim.sql
-- Google Takvim entegrasyonu: kullanıcının kendi takvimi Projelio'da görünür,
-- Projelio'dan Google'a etkinlik yazılır, Lio etkinlikleri göreve çevirir.
--
-- NEDEN AYRI BAĞLANTI TABLOSU
-- ---------------------------
-- Google hesabı Projelio'da zaten üç yerde duruyor: giriş kimliği ve Drive
-- (google_accounts), demo sunucusunun Meet bağlantısı (demo_sunuculari). Takvim
-- izni bunların HİÇBİRİNE eklenmiyor: kişi Projelio'ya kişisel Gmail'iyle
-- girip iş takvimini bağlamak isteyebilir; Drive'ı kesmek takvimi, takvimi
-- kesmek Drive'ı düşürmemeli. Kullanıcı başına tek takvim bağlantısı — içindeki
-- birden çok takvim (iş, aile, tatiller) `takvimler` listesinde seçilir.
--
-- NEDEN ETKİNLİKLER ÖNBELLEKTE
-- ----------------------------
-- Takvim sayfası her açılışta Google'a gitseydi sayfa Google'ın hızına bağlanır,
-- Lio aynı haftayı her soruda baştan çekerdi. Etkinlikler burada tutulur; sayfa
-- önbellekten anında çizilir, görünen aralık arka planda eşitlenir (bkz.
-- GoogleTakvimService.esitle). Önbellek aynı zamanda Projelio'ya ait bilgiyi
-- taşıyor: "bu etkinlik göreve çevrildi / yok sayıldı", "bu etkinliği şu plan
-- bloğu açtı". Eşitleme bu sütunlara DOKUNMAZ, yalnızca Google'dan gelenleri
-- günceller.

create table if not exists public.google_takvim_baglantilari (
  user_id               uuid primary key references public.users(id) on delete cascade,
  google_eposta         text not null,
  -- Şifreli (GOOGLE_TOKEN_ENC_KEY, bkz. google/token-crypto.util.ts).
  google_refresh_token  text not null,
  -- Birincil takvimin saat dilimi: Projelio'nun saat+tarih bloğu Google'a bu
  -- dilimle yazılır. Boşsa plan tercihlerindeki dilim kullanılır.
  saat_dilimi           text,
  -- [{id, ad, renk, birincil, yazilabilir, secili}] — bağlanırken Google'dan
  -- okunur, seçim kullanıcıya aittir. Liste izni verilmediyse yalnızca birincil.
  takvimler             jsonb not null default '[]'::jsonb,
  -- Projelio'dan açılan etkinliklerin yazıldığı takvim.
  hedef_takvim_id       text not null default 'primary',
  son_esitleme_at       timestamp,
  son_hata              text,
  -- Google erişimi geri aldı (invalid_grant). Satır silinmiyor: önbellekteki
  -- "göreve çevrildi" işaretleri yeniden bağlanınca kaybolmasın.
  kopuk_at              timestamp,
  baglandi_at           timestamp not null default current_timestamp
);

comment on table public.google_takvim_baglantilari is
  'Kullanicinin Google Takvim baglantisi. Drive (google_accounts) ve demo Meet (demo_sunuculari) baglantilarindan bagimsiz.';

alter table public.google_takvim_baglantilari enable row level security;

create table if not exists public.google_takvim_etkinlikleri (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  takvim_id         text not null,
  google_id         text not null,
  baslik            text,
  aciklama          text,
  konum             text,
  -- Tüm gün etkinliklerde gece yarısı (UTC) — tarih `tum_gun` ile okunur,
  -- bitiş Google'daki gibi HARİÇ (tek günlük etkinlik: 24 → 25).
  baslangic         timestamptz not null,
  bitis             timestamptz not null,
  tum_gun           boolean not null default false,
  google_durum      text,
  html_link         text,
  meet_link         text,
  katilimci_sayisi  integer,
  duzenleyen        text,
  google_guncellendi_at timestamptz,
  -- 'projelio': etkinliği Projelio açtı (blok ya da elle); düzenleyip
  -- silebiliriz. 'google': kullanıcının kendi takviminden geldi; salt okunur.
  kaynak            text not null default 'google' check (kaynak in ('google', 'projelio')),
  plan_blok_id      uuid references public.plan_time_blocks(id) on delete set null,
  gorev_id          uuid references public.tasks(id) on delete set null,
  -- Lio'nun ve kullanıcının kararı: yeni (henüz bakılmadı) · gorev (Projelio'ya
  -- işlendi) · yoksay (görev olmayacak — toplantı, kişisel). Lio "işlenmemiş
  -- etkinlikleri" sorduğunda aynı etkinliği tekrar tekrar önermesin diye.
  isleme            text not null default 'yeni' check (isleme in ('yeni', 'gorev', 'yoksay')),
  created_at        timestamp not null default current_timestamp,
  updated_at        timestamp not null default current_timestamp,

  unique (user_id, takvim_id, google_id)
);

comment on table public.google_takvim_etkinlikleri is
  'Google Takvim etkinliklerinin onbellegi + Projelio bagi (plan blogu, gorev, isleme karari). Esitleme yalnizca Google alanlarini gunceller.';

create index if not exists google_takvim_etkinlikleri_aralik_idx
  on public.google_takvim_etkinlikleri(user_id, baslangic);
create unique index if not exists google_takvim_etkinlikleri_blok_uniq
  on public.google_takvim_etkinlikleri(plan_blok_id) where plan_blok_id is not null;

alter table public.google_takvim_etkinlikleri enable row level security;
