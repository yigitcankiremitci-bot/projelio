-- 102 — Bildirimlerin e-posta ile gönderilmesi
--
-- SORUN: bildirim üretiliyordu ama kimseye ULAŞMIYORDU. Üç kanal vardı — ekran
-- (soket), tarayıcı push'u, WhatsApp — ve üçü de kullanıcının o an uygulamada
-- olmasına ya da bir kurulum yapmış olmasına bağlıydı:
--   · soket yalnızca sekme açıkken,
--   · web push mobilde ancak "ana ekrana ekle" sonrası (iOS'ta şart) çalışıyor,
--     VAPID anahtarları tanımlı değilse hiç çalışmıyor,
--   · WhatsApp köprüsü isteğe bağlı ve çoğu hesapta bağlı değil.
-- Yani pratikte "bildirimler açık" ama kimse bildirim almıyordu.
--
-- E-posta bu üçünün aksine HER hesapta var: kayıt olmak için doğrulanıyor.
-- Şifre sıfırlama ve doğrulama için kurulu olan gönderim katmanı (Resend, bkz.
-- auth/email.service.ts) burada yeniden kullanılıyor, ikinci bir altyapı yok.
--
-- ÜÇ SIKLIK, TEK KOLON:
--   anlik  → bildirim üretildikçe (birkaç dakikada bir toplanıp tek e-postada)
--   gunluk → günde bir, kullanıcının seçtiği SAATTE, o günün işleriyle birlikte
--   kapali → hiç
--
-- VARSAYILAN 'gunluk' ve satır YOKKEN DE geçerli: tablo boşken bile herkes 09:00
-- özetini alır. Tersi (satırı olmayan kimseye gönderme) özelliği fiilen kapalı
-- tutardı — kimse ayarlara girip açmaz, bildirimler yine ulaşmazdı.
--
-- SAAT DİLİMİ KULLANICININ: "her gün 09:00'da" sunucu saatiyle yorumlanırsa
-- yurt dışındaki kullanıcı özeti gece yarısı alır. Karşılaştırma kodda
-- Intl ile yapılıyor (bkz. notification-email.zaman.ts); Postgres'e taşımak
-- işleyiciyi tek bir sorguya bağımlı kılardı.
--
-- NEDEN WATERMARK (last_emailed_at), notifications'a "gönderildi" kolonu değil:
-- e-postası kapalı kullanıcıların bildirimleri o kolonda sonsuza kadar
-- "bekliyor" görünürdü ve kısmi indeks tablo kadar büyürdü. Watermark ise
-- yalnızca e-posta alan kullanıcı için ilerler; kapalıyken hiç okunmaz.

create table if not exists public.notification_email_prefs (
  user_id         uuid primary key references public.users(id) on delete cascade,
  frequency       varchar(10) not null default 'gunluk',
  -- 0-23, kullanıcının kendi saat diliminde. Günlük özet bu saatten SONRAKİ ilk
  -- turda gider (tur 10 dakikada bir), yani "09:00" pratikte 09:00-09:10 arası.
  daily_hour      smallint not null default 9,
  timezone        varchar(64) not null default 'Europe/Istanbul',
  -- Günlük özete "bugün biten görevlerim" listesi de eklensin mi. Bildirimlerden
  -- AYRI bir şey: görev bildirimi ancak son 24 saatte bir değişiklik olduysa
  -- üretilir, oysa bugün bitmesi gereken görev dün de oradaydı.
  include_tasks   boolean not null default true,
  -- Bu ana kadarki bildirimler e-postalandı sayılır. Satır açıldığı anda
  -- current_timestamp: yeni açılan tercih GEÇMİŞİ göndermemeli, yoksa ayarı
  -- ilk kez kaydeden kullanıcıya aylık bildirim yığını giderdi.
  last_emailed_at timestamp not null default current_timestamp,
  -- Günlük özetin gönderildiği son YEREL gün (kullanıcının saat diliminde).
  -- Aynı günde ikinci kez göndermeyi bu engelliyor; timestamp yerine date,
  -- çünkü soru "bugün gönderildi mi", "ne zaman gönderildi" değil.
  last_digest_on  date,
  created_at      timestamp not null default current_timestamp,
  updated_at      timestamp not null default current_timestamp,

  constraint notification_email_prefs_frequency_check
    check (frequency in ('anlik', 'gunluk', 'kapali')),
  constraint notification_email_prefs_daily_hour_check
    check (daily_hour between 0 and 23)
);

comment on table public.notification_email_prefs is
  'Bildirimlerin e-posta ile gonderim tercihi. Satir YOKSA varsayilan gecerlidir: gunluk ozet, 09:00, Europe/Istanbul.';
comment on column public.notification_email_prefs.frequency is
  'anlik | gunluk | kapali. Varsayilan gunluk.';
comment on column public.notification_email_prefs.daily_hour is
  'Gunluk ozetin gonderilecegi saat (0-23), KULLANICININ saat diliminde.';
comment on column public.notification_email_prefs.last_emailed_at is
  'Bu ana kadarki bildirimler e-postalandi sayilir. Bir sonraki gonderimde yalnizca bundan YENI bildirimler alinir.';
comment on column public.notification_email_prefs.last_digest_on is
  'Gunluk ozetin gonderildigi son yerel gun. Ayni gunde ikinci gonderimi engeller.';

-- İşleyicinin iki sorgusu: "anlık modunda kimler var" ve "günlük özet sırası
-- gelen kim". İkisi de frequency ile başlıyor.
create index if not exists idx_notification_email_prefs_frequency
  on public.notification_email_prefs (frequency);

drop trigger if exists trg_notification_email_prefs_updated_at on public.notification_email_prefs;
create trigger trg_notification_email_prefs_updated_at
  before update on public.notification_email_prefs
  for each row execute function public.set_updated_at();

-- RLS: proje genelindeki desen — açık ama policy yok. Erişim yalnızca
-- service_role ile, yani yalnızca NotificationEmailPrefsService üzerinden.
alter table public.notification_email_prefs enable row level security;
revoke all on public.notification_email_prefs from anon, authenticated;
