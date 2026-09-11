-- 103 — Bildirim e-postası: iki kanal aynı anda açık olabilsin
--
-- 102'de sıklık TEK bir kolondu (`frequency`: anlik | gunluk | kapali) ve bu
-- üçü BİRBİRİNİ DIŞLIYORDU. Kullanım bunun yanlış model olduğunu gösterdi:
-- kullanıcı "bir şey olduğunda haberim olsun" ile "her sabah günün dökümünü
-- gör" arasında seçim yapmak zorunda değil — ikisi FARKLI İHTİYAÇLAR ve çoğu
-- kişi ikisini birden istiyor:
--
--   anlık  = "şimdi ne oldu"    → tepki vermek için
--   günlük = "bugün ne var"     → planlamak için
--
-- Tek enum bunu ifade edemiyordu; iki bağımsız anahtar ediyor. "Kapalı" artık
-- ayrı bir değer değil, ikisinin de kapalı olması.
--
-- İKİ AYRI SU SEVİYESİ:
--   102'de tek bir `last_emailed_at` vardı ve iki kanal açıldığında bozulurdu:
--   anlık gönderim su seviyesini ilerletir, akşamki günlük özet "yeni bir şey
--   yok" diyerek BOŞ çıkardı. Oysa günlük özetin işi tam da gün içinde olanı
--   TEKRAR toparlamak. Bu yüzden anlık kendi seviyesini (last_instant_at),
--   günlük kendi penceresini (last_digest_at) taşıyor.
--
-- `last_digest_on` (tarih) duruyor ve işi değişmedi: "bugün gönderildi mi".
-- `last_digest_at` (an) ondan farklı bir soruya cevap veriyor: "özet hangi
-- ana kadar olanları anlattı". Tarihten türetilemez — kullanıcının seçtiği
-- saat değişebilir ve pencere gün başına değil, ÖNCEKİ ÖZETE dayanmalı.

alter table public.notification_email_prefs
  add column if not exists instant_enabled boolean not null default false,
  add column if not exists daily_enabled   boolean not null default true,
  add column if not exists last_digest_at  timestamp;

-- Mevcut tercihleri taşı. Sütun 102'den beri var ve bu migration'dan önce
-- yazılmış her satırda dolu.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notification_email_prefs'
      and column_name = 'frequency'
  ) then
    update public.notification_email_prefs
      set instant_enabled = (frequency = 'anlik'),
          daily_enabled   = (frequency = 'gunluk');

    -- Eski su seviyesi anlık kanalın seviyesiydi; adı artık onu söylüyor.
    alter table public.notification_email_prefs
      rename column last_emailed_at to last_instant_at;

    alter table public.notification_email_prefs
      drop constraint if exists notification_email_prefs_frequency_check;
    alter table public.notification_email_prefs
      drop column frequency;
  end if;
end $$;

comment on column public.notification_email_prefs.instant_enabled is
  'Bildirim olustukca e-posta gonderilsin mi. daily_enabled ile BAGIMSIZ: ikisi birden acik olabilir.';
comment on column public.notification_email_prefs.daily_enabled is
  'Gunluk ozet gonderilsin mi. Varsayilan acik; satiri olmayan kullanici da alir.';
comment on column public.notification_email_prefs.last_instant_at is
  'Anlik kanalin su seviyesi: bundan YENI bildirimler bir sonraki anlik e-postaya girer.';
comment on column public.notification_email_prefs.last_digest_at is
  'Son gunluk ozetin kapsadigi an. Bir sonraki ozet bundan sonrasini anlatir.';

-- 102'deki indeks frequency üzerindeydi, o kolon artık yok. İşleyicinin iki
-- sorgusu da artık boolean'a bakıyor; ikisi için iki kısmi indeks, çünkü her
-- sorgu yalnızca "açık" olanları istiyor.
drop index if exists public.idx_notification_email_prefs_frequency;

create index if not exists idx_notification_email_prefs_anlik
  on public.notification_email_prefs (user_id)
  where instant_enabled;

create index if not exists idx_notification_email_prefs_gunluk
  on public.notification_email_prefs (user_id)
  where daily_enabled;
