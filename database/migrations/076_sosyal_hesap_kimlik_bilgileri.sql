-- 076_sosyal_hesap_kimlik_bilgileri.sql
-- Sosyal medya hesaplarının giriş bilgileri (kullanıcı adı + şifre)
--
-- NEDEN AYRI TABLO
-- ---------------
-- social_accounts satırını okuyan onlarca kod yolu var: panel, takvim, yayın
-- kuyruğu, ileride AI bağlamı. Şifre o satırda dursaydı hepsi aynı anda bir
-- SIR okuyor olurdu ve "yanlışlıkla API yanıtına koymak" bir kod satırı
-- uzaklıkta kalırdı. Jetonlarda da aynı gerekçeyle ayrı tablo seçilmişti
-- (bkz. 058_social_publishing.sql, social_account_tokens).
--
-- NEDEN JETON TABLOSUNA EKLENMEDİ
-- -------------------------------
-- Jeton makineye ait, şifre insana: jeton süresi dolunca yenilenir, şifre
-- gösterilir. Erişim kuralları da farklı — jetonu hiç kimse görmez, şifreyi
-- yetkilendirilmiş insan görür. İkisi aynı tabloda olsaydı "hiç kimse görmez"
-- kuralı gevşemek zorunda kalırdı.
--
-- ŞİFRELEME: değerler uygulama katmanında AES-256-GCM ile şifrelenir
-- (common/crypto/token-crypto.ts). Anahtar veritabanında değil ortam
-- değişkeninde: SOCIAL_CREDENTIAL_ENC_KEY — SOCIAL_TOKEN_ENC_KEY'den BİLEREK
-- ayrı, biri sızarsa diğeri etkilenmesin ve ayrı ayrı döndürülebilsin.
--
-- GÜVENLİK NOTU: diğer sosyal medya tablolarıyla aynı model — RLS açık,
-- politika yok. Erişim yalnızca service_role üzerinden, yani yalnızca
-- SocialCredentialsService'ten geçer; kimin görebileceği kararı tamamen
-- servis katmanının sorumluluğudur (bkz. social-credential-access.ts).

-- ---------------------------------------------------------------------------
-- 1) Kimlik bilgileri
-- ---------------------------------------------------------------------------
-- Bir hesabın birden çok girişi olabiliyor: asıl profil şifresi, reklam
-- yöneticisi girişi, iki adımlı doğrulamanın yedek kodları. Bu yüzden hesap
-- başına tek satır değil, etiketli bir liste.

create table if not exists public.social_account_credentials (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.social_accounts(id) on delete cascade,

  -- "Ana giriş", "Meta Business Suite" — birden çok giriş varken hangisinin
  -- hangisi olduğu ancak buradan anlaşılıyor.
  label              varchar not null default 'Ana giriş',

  -- Kullanıcı adı da şifreli: giriş e-postası çoğu zaman kişinin kendi
  -- adresidir ve hesabın nerede olduğunu bilen biri için yarım anahtardır.
  username_enc       text,
  password_enc       text not null,
  -- Serbest not: kurtarma e-postası, 2FA'nın hangi telefonda olduğu, gizli
  -- soru. Şifreyle aynı gizlilikte, o yüzden aynı şifreleme.
  note_enc           text,

  -- Şifreyi giren kişi. Kendi girdiğini her zaman görebilir — bu sütun
  -- olmadan kullanıcı kendi yazdığı şifreyi bir daha okuyamazdı.
  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp,
  -- Şifrenin en son ne zaman değiştiği. "Bu şifre 8 aydır aynı" uyarısı için;
  -- updated_at etiket düzeltmesinde de değiştiği için ayrı tutuluyor.
  password_changed_at timestamp not null default current_timestamp
);

comment on table public.social_account_credentials is
  'Sosyal hesap giris bilgileri. Degerler uygulama katmaninda AES-256-GCM ile sifreli (SOCIAL_CREDENTIAL_ENC_KEY). Yalnizca SocialCredentialsService okur.';
comment on column public.social_account_credentials.created_by is
  'Sifreyi giren kisi. Kendi girdigi kaydi izin gerekmeden gorebilir.';

create index if not exists social_account_credentials_account_idx
  on public.social_account_credentials(account_id);

alter table public.social_account_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Görme izinleri
-- ---------------------------------------------------------------------------
-- Varsayılan KAPALI: modüle atanmış olmak şifreyi görmeye yetmez. Yönetici
-- (organizasyon sahibi / departman yöneticisi / modül yöneticisi) bir kişiye
-- tek tek izin verir. İzin kaydın kendisine değil kişiye bağlıdır ve geri
-- alınabilir.

create table if not exists public.social_credential_grants (
  id                 uuid primary key default gen_random_uuid(),
  credential_id      uuid not null references public.social_account_credentials(id) on delete cascade,
  user_id            uuid not null references public.users(id) on delete cascade,

  granted_by         uuid references public.users(id) on delete set null,
  granted_at         timestamp not null default current_timestamp,
  -- Süreli izin: "kampanya boyunca". Boşsa süresizdir.
  expires_at         timestamp,
  -- Geri alınan izin SİLİNMEZ; kimin ne zaman erişebildiği geçmişi kalsın.
  revoked_at         timestamp,
  revoked_by         uuid references public.users(id) on delete set null,

  -- Aynı kişiye aynı kayıt için iki satır olmasın; izin geri alındığında
  -- satır güncellenir, yenisi açılmaz.
  constraint social_credential_grants_unique unique (credential_id, user_id)
);

comment on table public.social_credential_grants is
  'Kime hangi sosyal hesap sifresinin gosterilecegi. Yalnizca yoneticiler yazar; revoked_at dolu satir izin vermez.';

create index if not exists social_credential_grants_user_idx
  on public.social_credential_grants(user_id) where revoked_at is null;

alter table public.social_credential_grants enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Görüntüleme kaydı
-- ---------------------------------------------------------------------------
-- Şifre "gösterildi" anı kaydedilir. Sır paylaşımının denetlenebilir olması
-- iznin kendisi kadar önemli: bir hesap ele geçtiğinde "şifreyi en son kim
-- gördü" sorusunun bir yanıtı olmalı. Yalnızca yöneticiler okuyabilir.

create table if not exists public.social_credential_views (
  id                 uuid primary key default gen_random_uuid(),
  credential_id      uuid not null references public.social_account_credentials(id) on delete cascade,
  user_id            uuid references public.users(id) on delete set null,
  -- 'admin' | 'creator' | 'grant' — erişimin hangi haktan geldiği. İzin geri
  -- alındıktan sonra bile o anki gerekçe okunabilsin diye yazılıyor.
  reason             varchar not null,
  viewed_at          timestamp not null default current_timestamp
);

comment on table public.social_credential_views is
  'Sosyal hesap sifresinin gosterildigi anlar. Denetim izi; silinmez.';

create index if not exists social_credential_views_credential_idx
  on public.social_credential_views(credential_id, viewed_at desc);

alter table public.social_credential_views enable row level security;
