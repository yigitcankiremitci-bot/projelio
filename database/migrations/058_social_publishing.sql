-- 058_social_publishing.sql
-- Instagram entegrasyonu: jeton saklama + yayın kuyruğu
--
-- 054 şemayı entegrasyonu bekleyerek yazmıştı; bu migration o boşlukları
-- dolduruyor. Üç iş yapıyor:
--
--   1) Erişim jetonları için AYRI ve ŞİFRELİ bir tablo
--   2) Yayın kuyruğunun ihtiyaç duyduğu deneme/zamanlama alanları
--   3) Meta'nın medyayı çekebilmesi için geçici public bucket
--
-- ---------------------------------------------------------------------------
-- NEDEN AYRI JETON TABLOSU
-- ---------------------------------------------------------------------------
-- 054'te `social_accounts.access_token_ref` vardı ve "jetonun kendisi buraya
-- yazılmaz" notu düşülmüştü. Sebebi hâlâ geçerli: social_accounts modülün
-- gündelik okuma tablosu — panel her açılışta hepsini çekiyor, ileride rapor ve
-- AI bağlamı da okuyacak. Jeton o satırda dursaydı, hesabı okuyan her kod yolu
-- aynı zamanda bir sırrı okuyor olurdu.
--
-- Ayrı tablo, google_accounts deseniyle aynı: değer uygulama katmanında
-- AES-256-GCM ile şifrelenir (backend/src/modules/google/token-crypto.util.ts),
-- anahtar veritabanında değil ortam değişkenindedir. Bir veritabanı sızıntısı
-- tek başına hesaplara erişim vermez.
--
-- ---------------------------------------------------------------------------
-- GÜVENLİK NOTU
-- ---------------------------------------------------------------------------
-- Diğer modül tablolarıyla aynı model: RLS açık, politika yok. Erişim yalnızca
-- service_role üzerinden. Bu tablo için kural daha da katı: jeton satırları
-- SocialTokensService dışında HİÇBİR servisten okunmamalı ve hiçbir API yanıtı
-- şifreli değeri bile taşımamalıdır.

-- ---------------------------------------------------------------------------
-- 1) Jetonlar
-- ---------------------------------------------------------------------------

create table if not exists public.social_account_tokens (
  account_id         uuid primary key references public.social_accounts(id) on delete cascade,

  -- Instagram'da (Business Login) tek bir uzun ömürlü jeton var; refresh
  -- jetonu ayrı bir değer değil, aynı jeton "yenilenerek" 60 gün daha uzuyor.
  -- Yine de iki kolon tutuyoruz: Facebook Login yolu ya da başka bir platform
  -- (LinkedIn, X) eklendiğinde refresh ayrı bir değer olacak.
  access_token_enc   text not null,
  refresh_token_enc  text,

  -- Jetonun son geçerlilik anı. Yenileme işi bu tarihe bakar; Instagram
  -- uzun ömürlü jetonu süresi dolmadan ÖNCE yenilemeyi şart koşuyor
  -- (dolmuş jeton yenilenemez, kullanıcı yeniden bağlanmak zorunda kalır).
  expires_at         timestamp,
  last_refreshed_at  timestamp,

  -- Meta'nın verdiği izinler. Yayın denemesinden önce bakılır: izin
  -- verilmemişse hata Meta'dan değil bizden gelsin, mesajı anlaşılır olsun.
  scopes             text[],

  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp not null default current_timestamp
);

comment on table public.social_account_tokens is
  'Sosyal platform erisim jetonlari. Degerler uygulama katmaninda AES-256-GCM ile sifreli; anahtar ortam degiskeninde. Yalnizca SocialTokensService okur.';

alter table public.social_account_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Hesap tarafı: bağlantı kimliği ve sağlığı
-- ---------------------------------------------------------------------------
-- 054'teki access_token_ref artık kullanılmıyor (jeton ayrı tabloda). Kolonu
-- DÜŞÜRMÜYORUZ: 054 çalıştırılmış kurulumlarda içi boş, düşürmek de bir sonraki
-- migration'ın işi değil — ama yeni kod ona yazmıyor.

alter table public.social_accounts
  add column if not exists provider varchar not null default 'manual'
    check (provider in ('manual','instagram_login','facebook_login'));

comment on column public.social_accounts.provider is
  'Hesap nasil baglandi: manual (yayini kullanici yapar), instagram_login (Business Login for Instagram), facebook_login (Facebook Login for Business).';

-- Bağlantı koptuğunda kullanıcıya ne söyleyeceğimiz. Meta'nın hata metni
-- ("Error validating access token") kullanıcıya gösterilecek bir cümle değil.
alter table public.social_accounts
  add column if not exists connection_error text;

-- ---------------------------------------------------------------------------
-- 3) Yayın kuyruğu
-- ---------------------------------------------------------------------------
-- Yayın hedef bazında yürür (social_post_targets): üç hesaptan biri hata
-- verdiğinde diğerleri yayımlanmış olmalı.

alter table public.social_post_targets
  -- Kuyruğun okuduğu an. Gönderinin scheduled_at'ından KOPYALANIR, çünkü
  -- kullanıcı içeriğin saatini değiştirdiğinde yalnızca henüz yayımlanmamış
  -- hedefler kayar; yayımlanmış olanın geçmişi olduğu yerde kalır.
  add column if not exists publish_at timestamp,
  add column if not exists attempt_count integer not null default 0,
  -- Geçici hatalarda (Meta 5xx, ağ) üstel geri çekilme; kalıcı hatalarda
  -- (izin yok, jeton geçersiz) doldurulmaz — sonsuz döngü olmaz.
  add column if not exists next_attempt_at timestamp,
  -- Meta'nın konteyner kimliği. İki adımlı yayında (konteyner → publish)
  -- ikinci adım koparsa aynı konteynerle devam edilir, medya yeniden
  -- yüklenmez. Konteyner 24 saat sonra kendiliğinden düşer.
  add column if not exists container_id varchar;

-- Kuyruk sorgusu: "vakti gelmiş, hâlâ bekleyen hedefler". Kısmi indeks —
-- yayımlanmış milyonlarca satır indekste yer kaplamasın.
create index if not exists social_post_targets_queue_idx
  on public.social_post_targets (publish_at)
  where status in ('pending', 'scheduled');

-- ---------------------------------------------------------------------------
-- 4) Geçici yayın kovası
-- ---------------------------------------------------------------------------
-- Meta medyayı KENDİ sunucularından cURL ediyor: "media must be hosted on a
-- publicly accessible server at the time of the attempt". Bizim medyamız
-- Drive/OneDrive'da ve oraya imzasız erişim yok.
--
-- Çözüm: yayın anında dosya bu kovaya kopyalanır, Meta oradan okur, yayın
-- bitince kopya silinir. Kalıcı ikinci bir arşiv değil, taşıma bandı.
--
-- Kova PUBLIC olmak zorunda — Meta imzalı adres kullanamıyor. Bu yüzden yol
-- adları tahmin edilemez olmalı (uuid) ve kopya yayından hemen sonra silinmeli;
-- temizlik işi ayrıca 24 saatten eski artıkları toplar.

insert into storage.buckets (id, name, public)
values ('social-publish', 'social-publish', true)
on conflict (id) do nothing;
