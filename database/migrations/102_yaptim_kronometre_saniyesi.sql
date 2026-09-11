-- 102 — Yaptım: kronometrenin saniyesi ayrı tutuluyor (duraklat/devam et)
--
-- SORUN: kronometre durdurulduğunda geçen süre DAKİKAYA YUVARLANIP kayıtlı
-- süreye ekleniyordu ve en az 1 dakika sayılıyordu. Tek seferlik kullanımda
-- zararsızdı. Ama duraklatma bir özellik hâline gelince aynı davranış süreyi
-- ŞİŞİRİYOR: 10 saniyelik beş ara, 50 saniyelik işi 5 dakika gösteriyordu.
--
-- Süreyi ölçmenin amacı "bu iş ne kadar sürer"i bilmek; her duraklatmada
-- yukarı yuvarlanan bir sayı, tam da o soruya yanlış cevap veriyor.
--
-- ÇÖZÜM: kronometrenin biriktirdiği süre burada SANİYE olarak tutuluyor ve
-- duration_minutes ondan türetiliyor. Yuvarlama artık her duraklatmada değil,
-- yalnızca gösterim/kayıt anında bir kez yapılıyor.
--
-- NEDEN duration_minutes DURUYOR: kayıtların çoğunda kronometre hiç
-- kullanılmıyor — kullanıcı "45" yazıp geçiyor. Süreyi tek kolonda saniye
-- olarak tutmak, elle girilen her değeri de saniyeye çevirmek ve özet
-- sorgularını değiştirmek demekti; kazancı yok.
--
-- İKİSİ ARASINDAKİ KURAL (bkz. WorklogService):
--   · Kronometre kullanıldıysa timer_seconds birikiyor, duration_minutes
--     ondan hesaplanıyor.
--   · Kullanıcı süreyi ELLE yazdıysa duration_minutes onun dediği olur ve
--     timer_seconds ona eşitlenir — sonraki "devam et" tutarlı yerden sürer.

alter table public.work_log_entries
  add column if not exists timer_seconds integer not null default 0;

comment on column public.work_log_entries.timer_seconds is
  'Kronometrenin biriktirdigi TAM sure (saniye). duration_minutes bundan turetilir; elle sure girilirse buna esitlenir.';

alter table public.work_log_entries
  drop constraint if exists work_log_entries_timer_seconds_pozitif;
alter table public.work_log_entries
  add constraint work_log_entries_timer_seconds_pozitif
  check (timer_seconds >= 0 and timer_seconds <= 86400);

-- Geçmiş kayıtlar: kronometreyle mi girildikleri bilinmiyor, ama duration
-- değerleri doğru. Saniye karşılıklarını yazmak, o kayıtlarda "devam et"
-- denildiğinde sürenin sıfırdan başlamasını önlüyor.
update public.work_log_entries
set timer_seconds = least(duration_minutes * 60, 86400)
where duration_minutes is not null and timer_seconds = 0;
