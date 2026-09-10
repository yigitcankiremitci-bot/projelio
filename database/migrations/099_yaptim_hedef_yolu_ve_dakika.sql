-- 099 — Yaptım: bağlantı hedefinin adresi + görev süresinde "dakika" birimi
--
-- ---------------------------------------------------------------------------
-- 1) work_log_entries.target_path — bağlantının GİDİLEBİLİR adresi
-- ---------------------------------------------------------------------------
--
-- Bağlantı polimorfik (target_kind + target_id) ve bu, listeleme için yeterliydi:
-- satırın yanında hedefin adı yazıyordu. Ama ad TIKLANAMIYORDU ve kullanıcının
-- ilk yaptığı şey ona tıklamak.
--
-- NEDEN KOLON, NEDEN HESAPLAMA DEĞİL:
--   Adres türden türetilebilir görünüyor (`project` -> /projects/:id) ama GÖREV
--   için türetilemez: bir görevin sayfası kendi id'si değil, bağlı olduğu
--   projenin ya da departmanın sayfasıdır (bkz. tasks.service taskPath). Adresi
--   üretmek için görevi ayrıca okumak gerekirdi — hem de listedeki HER satır
--   için. Bağlama anında bir kez yazmak, her okumada N sorgudan ucuz.
--
--   Ayrıca hedef silinse bile adres kalıyor: kullanıcı nereye baktığını
--   görebiliyor, tıkladığında da o sayfanın kendi "bulunamadı" hâline düşüyor.
--   Sessizce kaybolan bir bağlantıdan iyi.

alter table public.work_log_entries
  add column if not exists target_path text;

comment on column public.work_log_entries.target_path is
  'Hedefin uygulama ici adresi (/projects/<id> gibi). Baglama aninda yazilir; gorev icin kendi id''si DEGIL projesinin/departmaninin adresidir.';

-- ---------------------------------------------------------------------------
-- 2) tasks.estimated_duration_unit — "dakika" da bir birim
-- ---------------------------------------------------------------------------
--
-- Birim yalnızca saat ve gündü. Arayüzdeki sayı kutusu da yarım saatlik
-- adımlarla artıyordu; sonuç olarak "15 dakika süren iş" HİÇ yazılamıyordu —
-- en küçük ifade edilebilir değer yarım saatti ve kullanıcı ya üç katını
-- yazıyor ya da hiç yazmıyordu.
--
-- Kısa işler bu üründe istisna değil kural: telefon görüşmesi, hızlı düzeltme,
-- onay bekleyen bir imza. Süreyi ölçmenin bütün amacı bunları da toplayabilmek.
--
-- 'minutes' EKLENDİ, mevcut satırlara dokunulmadı: eski kayıtlar saat/gün
-- olarak yazılmıştı ve öyle kalıyor.

alter table public.tasks
  drop constraint if exists tasks_estimated_duration_unit_check;

alter table public.tasks
  add constraint tasks_estimated_duration_unit_check
  check (estimated_duration_unit is null or estimated_duration_unit in ('minutes', 'hours', 'days'));

comment on column public.tasks.estimated_duration_unit is
  'minutes | hours | days. Tahmini surenin birimi; gerceklesen sure ayri kolonda (actual_duration_minutes).';
