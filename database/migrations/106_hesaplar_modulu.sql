-- 106_hesaplar_modulu.sql
-- Hesaplar modülü: üye olunan hesaplar, giriş bilgileri, paylaşım ve geçiş anahtarları
--
-- SORUN
-- -----
-- Şirketin üye olduğu hesaplar (Adobe, Google Workspace, banka internet
-- şubesi, e-Devlet, kargo firması paneli, kurs üyelikleri) hiçbir yerde
-- toplanmıyordu. Üç ayrı sorun aynı boşluktan doğuyordu:
--
--   1. Şifreler WhatsApp'ta, not defterinde, kişilerin kafasında duruyordu.
--      Çalışan ayrılınca hangi hesaba erişimi olduğu bilinmiyordu.
--   2. Ücretli abonelikler kasada görünmüyordu: aylık 40 USD'lik bir araç,
--      yıl sonunda "bu para nereye gitti" sorusunun cevapsız kalan kısmıydı.
--   3. Giriş adresleri her seferinde aranıyordu.
--
-- Sosyal medya hesaplarının şifreleri 076'da çözülmüştü; bu migration aynı
-- deseni TÜM hesaplara genelliyor. Sosyal medya tabloları KALDIRILMIYOR: o
-- modül hesabı bir yayın kanalı olarak tutuyor (kitle, ton, takvim), buradaki
-- kayıt ise bir ÜYELİK. Aynı Instagram hesabı iki yerde görünebilir ve bu bir
-- çift sayım değil — para tek yerde (bkz. 104), sır iki yerde de kendi
-- modülünün yetki kuralıyla korunuyor.
--
-- ŞİFRELEME: değerler uygulama katmanında AES-256-GCM ile şifrelenir
-- (common/crypto/token-crypto.ts). Anahtar veritabanında değil ortam
-- değişkeninde: HESAP_KIMLIK_ENC_KEY — sosyal medyanın anahtarından BİLEREK
-- ayrı, biri sızarsa diğeri etkilenmesin ve ayrı ayrı döndürülebilsin.
--
-- GÜVENLİK MODELİ: diğer modül tablolarıyla aynı — RLS açık, politika yok.
-- Erişim yalnızca service_role üzerinden, yani yalnızca servis katmanından
-- geçer; kimin görebileceği kararı hesap-erisim.ts'te saf fonksiyonda.

-- ---------------------------------------------------------------------------
-- 1) Hesaplar
-- ---------------------------------------------------------------------------
-- Kapsam sosyal medyayla birebir aynı: ya organizasyon (departman altında) ya
-- iş. Serbest çalışanın da üyelikleri var ve onun kasası işin kasası.

create table if not exists public.service_accounts (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id)          on delete cascade,
  department_id      uuid references public.departments(id)   on delete set null,

  name               varchar not null,            -- "Adobe Creative Cloud"
  -- Serbest metin DEĞİL sabit liste: kategori süzgeci ve "yazılım aboneliği
  -- toplamı" sorusu ancak kapalı listeyle çalışıyor.
  category           varchar not null default 'diger'
                       check (category in ('yazilim','bulut','sosyal','banka','resmi',
                                           'egitim','pazaryeri','kargo','iletisim','diger')),
  -- Giriş adresi. Toplu link düğmesi bu sütunu açıyor (bkz. lib/topluLink.ts).
  url                text,

  -- Hesaba NASIL girildiği. Şifresiz girişler (geçiş anahtarı, Google ile
  -- devam et) gerçek ve yaygın: bunları "şifresi girilmemiş hesap" diye
  -- eksik göstermek, listeyi kullanılamaz hâle getiriyordu.
  login_method       varchar not null default 'password'
                       check (login_method in ('password','passkey','sso_google','sso_microsoft',
                                               'magic_link','certificate','other')),
  plan               varchar,                     -- "Team — 5 koltuk"
  -- Hesabın sorumlusu: fatura ve yenileme kimin işi.
  owner_user_id      uuid references public.users(id) on delete set null,
  -- SIR DEĞİL: "kurumsal kart ile ödeniyor", "Ayşe'nin adına açık" gibi notlar.
  -- Kurtarma e-postası, 2FA yedek kodu gibi bilgiler credentials.note_enc'e.
  note               text,

  -- ------------------------------------------------- Abonelik
  -- Ücretsiz hesap da listede duruyor (e-Devlet, tedarikçi paneli); bu yüzden
  -- abonelik alanları hepsi boş bırakılabilir.
  is_paid            boolean not null default false,
  amount             numeric(12,2),
  currency           varchar(3) not null default 'TRY',
  billing_interval   varchar
                       check (billing_interval is null or
                              billing_interval in ('weekly','monthly','quarterly','semiannual','yearly')),
  next_due_date      date,
  -- Kasadaki düzenli gider satırı. Defter TEK yerde (104): bu modül kendi
  -- para tablosunu TUTMAZ, yalnızca defterdeki satıra işaret eder. Satır
  -- silinirse bağ kopar ve hesap "kasaya bağlı değil" görünür — sessizce
  -- yanlış bir tutar göstermekten iyisi.
  --
  -- Abonelik işareti kaldırıldığında bağ KOPARILMIYOR, satır pasifleşiyor:
  -- geçmiş ödemelerin hangi hesaba ait olduğu kalsın ve yeniden
  -- işaretlendiğinde ikinci bir satır açılmasın (bkz. hesap-abonelik.ts).
  recurring_payment_id uuid references public.recurring_payments(id) on delete set null,

  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp,

  constraint service_accounts_scope check (num_nonnulls(organization_id, job_id) = 1),
  -- Ücretli işaretlenmiş bir hesabın tutarı ve ritmi olmadan kasaya gideri
  -- yazılamaz; yarım kayıt "abonelik var ama gider yok" demek olurdu.
  constraint service_accounts_paid_fields
    check (not is_paid or (amount is not null and billing_interval is not null))
);

comment on table public.service_accounts is
  'Uye olunan hesaplar (Hesaplar modulu). Para BURADA TUTULMAZ: ucretli abonelik recurring_payments satirina baglanir (bkz. recurring_payment_id).';

-- Hesap ARŞİVLENMİYOR, siliniyor: 076'daki gerekçe burada da geçerli — bir
-- hesap kaydının değeri taşıdığı sırdır ve "artık kullanılmayan" bir sırrın
-- veritabanında durması yalnızca risktir. Silinince giriş bilgileri,
-- paylaşımlar ve denetim izi cascade ile birlikte gider; kasadaki düzenli
-- ödeme satırı ise pasifleştirilir, silinmez (bkz. hesap-abonelik.ts).
create index if not exists service_accounts_organization_idx
  on public.service_accounts(organization_id, department_id);
create index if not exists service_accounts_job_idx
  on public.service_accounts(job_id);

alter table public.service_accounts enable row level security;

-- ---------------------------------------------------------------------------
-- 2) Giriş bilgileri
-- ---------------------------------------------------------------------------
-- Bir hesabın birden çok girişi olabiliyor: yönetici girişi, ortak ekip
-- girişi, fatura portalı girişi. Bu yüzden hesap başına tek satır değil,
-- etiketli bir liste (076'daki gerekçenin aynısı).
--
-- NEDEN AYRI TABLO: service_accounts satırını okuyan kod yolu çok (liste,
-- toplu link, abonelik toplamı, ileride Lio bağlamı). Şifre o satırda
-- dursaydı hepsi aynı anda bir SIR okuyor olurdu ve yanlışlıkla API yanıtına
-- koymak bir kod satırı uzaklıkta kalırdı.

create table if not exists public.service_account_credentials (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references public.service_accounts(id) on delete cascade,

  label              varchar not null default 'Ana giriş',

  -- Kullanıcı adı da şifreli: giriş e-postası hesabın yarım anahtarıdır.
  username_enc       text,
  -- Şifresiz giriş yöntemlerinde (geçiş anahtarı, SSO) BOŞ olabilir: kayıt o
  -- zaman "bu hesaba şu kullanıcıyla, şu yöntemle giriliyor" bilgisini taşır.
  password_enc       text,
  -- Kurtarma e-postası, 2FA'nın hangi telefonda olduğu, yedek kodlar.
  note_enc           text,
  -- İki adımlı doğrulamanın ortak sırrı (TOTP anahtarı). Şifreden ayrı sütun:
  -- şifre değişince bu değişmiyor ve çoğu hesapta hiç yok.
  totp_enc           text,

  created_by         uuid references public.users(id) on delete set null,
  updated_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default current_timestamp,
  updated_at         timestamp,
  password_changed_at timestamp not null default current_timestamp
);

comment on table public.service_account_credentials is
  'Hesap giris bilgileri. Degerler uygulama katmaninda AES-256-GCM ile sifreli (HESAP_KIMLIK_ENC_KEY). Yalnizca HesapKimlikService okur.';
comment on column public.service_account_credentials.password_enc is
  'Sifresiz giris yontemlerinde (passkey, SSO) NULL olabilir.';

create index if not exists service_account_credentials_account_idx
  on public.service_account_credentials(account_id);

alter table public.service_account_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- 3) Paylaşım izinleri
-- ---------------------------------------------------------------------------
-- Varsayılan KAPALI. Yönetici (organizasyon sahibi / departman yöneticisi /
-- modül yöneticisi) bir kişiye ya TEK BİR HESABI ya da modüldeki TÜM
-- hesapları açar.
--
-- NEDEN TEK TABLO: "tümü" izni, account_id'nin boş olduğu bir satır. İki ayrı
-- tablo olsaydı "bu kişi bu hesabı görebiliyor mu" sorusu iki sorgudan ve iki
-- kod yolundan geçerdi; ikisinden birini güncellemeyi unutmak, kapalı olması
-- gereken bir sırrı açık bırakmak demekti.
--
-- İzin HESABA verilir, kimlik satırına değil: kullanıcı "şu hesabı paylaş"
-- diye düşünüyor, "şu hesabın üçüncü giriş satırını" diye değil. Hesabın
-- bütün girişleri izne dahildir.

create table if not exists public.service_account_grants (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,

  -- Boşsa: aşağıdaki kapsamdaki TÜM hesaplar.
  account_id         uuid references public.service_accounts(id) on delete cascade,
  organization_id    uuid references public.organizations(id) on delete cascade,
  department_id      uuid references public.departments(id)   on delete cascade,
  job_id             uuid references public.jobs(id)          on delete cascade,

  granted_by         uuid references public.users(id) on delete set null,
  granted_at         timestamp not null default current_timestamp,
  -- Süreli izin ("proje boyunca"). Boşsa süresizdir.
  expires_at         timestamp,
  -- Geri alınan izin SİLİNMEZ: kimin ne zaman erişebildiği geçmişi kalsın.
  revoked_at         timestamp,
  revoked_by         uuid references public.users(id) on delete set null,

  -- Ya tek hesap ya bir kapsam; ikisi birden anlamsız ve hangisinin geçerli
  -- olduğu belirsiz kalırdı.
  constraint service_account_grants_target
    check ((account_id is not null and organization_id is null and job_id is null)
           or (account_id is null and num_nonnulls(organization_id, job_id) = 1))
);

comment on table public.service_account_grants is
  'Kime hangi hesabin giris bilgilerinin gosterilecegi. account_id bos = kapsamdaki tum hesaplar. Yalnizca yoneticiler yazar; revoked_at dolu satir izin vermez.';

-- Aynı kişiye aynı hedef için ikinci satır açılmıyor: izin geri alınıp
-- yeniden verildiğinde aynı satır tazeleniyor.
create unique index if not exists service_account_grants_account_uniq
  on public.service_account_grants(account_id, user_id) where account_id is not null;

-- Kapsam izninde tekillik: null'lar unique indekste birbirine eşit
-- sayılmadığı için coalesce ile sabit bir kimliğe çevriliyor.
create unique index if not exists service_account_grants_scope_uniq
  on public.service_account_grants(
    user_id,
    coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(department_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(job_id,          '00000000-0000-0000-0000-000000000000'::uuid)
  ) where account_id is null;

create index if not exists service_account_grants_user_idx
  on public.service_account_grants(user_id) where revoked_at is null;

alter table public.service_account_grants enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Görüntüleme kaydı
-- ---------------------------------------------------------------------------
-- Sır "gösterildi" anı kaydedilir. Bir hesap ele geçtiğinde "şifreyi en son
-- kim gördü" sorusunun bir yanıtı olmalı. Kilidin hangi yöntemle açıldığı da
-- yazılıyor: geçiş anahtarı cihazı kanıtlar, şifre yalnızca bilgiyi.

create table if not exists public.service_credential_views (
  id                 uuid primary key default gen_random_uuid(),
  credential_id      uuid not null references public.service_account_credentials(id) on delete cascade,
  user_id            uuid references public.users(id) on delete set null,
  -- 'admin' | 'creator' | 'account_grant' | 'scope_grant'
  reason             varchar not null,
  -- 'password' | 'passkey'
  unlock_method      varchar not null default 'password',
  viewed_at          timestamp not null default current_timestamp
);

comment on table public.service_credential_views is
  'Hesap sifresinin gosterildigi anlar. Denetim izi; silinmez.';

create index if not exists service_credential_views_credential_idx
  on public.service_credential_views(credential_id, viewed_at desc);

alter table public.service_credential_views enable row level security;

-- ---------------------------------------------------------------------------
-- 5) Geçiş anahtarları (WebAuthn)
-- ---------------------------------------------------------------------------
-- KULLANICIYA ait, modüle değil: bu yüzden users_* deseninde ve Hesaplar
-- modülünün tablolarından ayrı. Bugün tek kullanımı "sırrı göstermeden önce
-- kilidi aç", ama aynı kayıt ileride girişte de kullanılabilir — o yüzden
-- hesaplar_* diye adlandırılmadı.
--
-- Burada saklanan şey AÇIK anahtar: sızsa bile kimseye giriş sağlamaz, özel
-- anahtar kullanıcının cihazından hiç çıkmıyor. Bu yüzden şifrelenmiyor.

create table if not exists public.user_passkeys (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,

  -- Authenticator'ın ürettiği kimlik (base64url). Tekil: aynı cihaz aynı
  -- hesap için ikinci kez kaydedilirse üzerine yazılır.
  credential_id      text not null unique,
  -- SPKI DER, base64. node:crypto bu biçimden doğrudan anahtar kuruyor.
  public_key         text not null,
  -- COSE algoritma kimliği: -7 = ES256, -257 = RS256.
  algorithm          integer not null,
  -- Authenticator'ın imza sayacı. Geriye gitmesi klonlanmış cihaz işaretidir.
  sign_count         bigint not null default 0,
  transports         varchar,
  aaguid             varchar,
  -- Kullanıcının tanıyacağı ad: "MacBook Touch ID", "iPhone".
  label              varchar,

  created_at         timestamp not null default current_timestamp,
  last_used_at       timestamp
);

comment on table public.user_passkeys is
  'Kullanicinin gecis anahtarlari (WebAuthn). public_key ACIK anahtardir; ozel anahtar cihazdan cikmaz. Dogrulama: backend/src/common/webauthn/.';

create index if not exists user_passkeys_user_idx on public.user_passkeys(user_id);

alter table public.user_passkeys enable row level security;

-- Tek kullanımlık meydan okumalar (challenge).
--
-- NEDEN VERİTABANINDA: challenge'ın iki şartı var — sunucu üretecek ve BİR KEZ
-- kullanılacak. İmzalı bir jetonla ikincisi sağlanamıyor (jeton süresi
-- boyunca tekrar oynatılabilirdi). Satırlar kısa ömürlü; temizliği
-- doğrulamanın kendisi yapıyor (süresi geçmişleri siler).

create table if not exists public.webauthn_challenges (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade,
  challenge          text not null,
  -- 'register' | 'unlock' — kayıt meydan okuması giriş doğrulamasında
  -- kullanılamasın.
  purpose            varchar not null check (purpose in ('register','unlock')),
  created_at         timestamp not null default current_timestamp,
  expires_at         timestamp not null,
  used_at            timestamp
);

create index if not exists webauthn_challenges_user_idx
  on public.webauthn_challenges(user_id, purpose) where used_at is null;

alter table public.webauthn_challenges enable row level security;

-- ---------------------------------------------------------------------------
-- 6) anon/authenticated yetkilerinin geri alınması
-- ---------------------------------------------------------------------------
-- 076'daki gerekçenin aynısı: RLS açık ve politikasız olduğu için bugün
-- zaten her şey reddediliyor, ama bu tablolar PAROLA tutuyor ve koruma tek
-- katmana indirgenmemeli. İleride biri politika eklerse ya da RLS'i
-- kapatırsa, yetkinin de kapalı olması aradaki fark olur.

revoke all on public.service_accounts             from anon, authenticated;
revoke all on public.service_account_credentials  from anon, authenticated;
revoke all on public.service_account_grants       from anon, authenticated;
revoke all on public.service_credential_views     from anon, authenticated;
revoke all on public.user_passkeys                from anon, authenticated;
revoke all on public.webauthn_challenges          from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7) Katalog kaydı
-- ---------------------------------------------------------------------------
-- Modül BİRDEN FAZLA departmana açılıyor (module_catalog_departments, bkz.
-- 046): hesapların sahibi tek bir departman değil. Yazılım ve bulut hesapları
-- BT'nin, ödemeler Finans'ın, kurumsal üyelikler Yönetim'in işi. Birincil
-- departman BT: hesap listesini fiilen o tutuyor.
--
-- applies_to_freelancer = true: serbest çalışanın da abonelikleri var ve
-- gideri işin kasasına gidiyor.
--
-- Mevcut organizasyonlarda OTOMATİK AÇILMIYOR (078'deki gerekçe): bu yeni bir
-- seçenek, bir göçün hedefi değil. Yönetici katalogdan açar.

insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('hesaplar', 'bilgi_teknolojileri_yazilim', 'Hesaplar',
   'Üye olunan tüm hesapları ve giriş bilgilerini tek yerde tutar: şifreler şifrelenmiş saklanır ve ancak kilit açılarak gösterilir, ücretli abonelikler kasaya düzenli gider olarak işlenir, giriş adresleri tek düğmeyle açılır.',
   'organization', true, 4)
on conflict (key) do nothing;

insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values
  ('hesaplar', 'bilgi_teknolojileri_yazilim', true,  4),
  ('hesaplar', 'yonetim',                     false, 14),
  ('hesaplar', 'finans_muhasebe',             false, 14)
on conflict (module_key, department_key) do nothing;
