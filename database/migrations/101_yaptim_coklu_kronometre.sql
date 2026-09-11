-- 101 — Yaptım: aynı anda birden fazla kronometre
--
-- 097'de kural şuydu: bir kullanıcının aynı anda YALNIZCA BİR kronometresi
-- çalışabilir ve kural veritabanında (kısmi tekil indeks) duruyordu. Gerekçesi
-- "kullanıcı hangi işi ölçtüğünü bilmesin istemiyoruz" idi.
--
-- GERÇEK KULLANIM BU VARSAYIMI YANLIŞLADI: insanlar aynı anda birden fazla işle
-- ilgileniyor — derleme dönerken başka bir şeye bakmak, iki paralel görüşme,
-- arka planda süren bir bekleme. Tek kronometre bunları ölçmenin önüne
-- geçiyordu: ikinci işi başlatmak birincisini SESSİZCE durduruyor ve
-- kullanıcının o sırada hâlâ sürdürdüğü işin süresi eksik kalıyordu.
--
-- Ölçümün eksik olması, ölçümün karışık olmasından kötü: hangi kronometrenin
-- çalıştığı arayüzde zaten görünüyor (satır vurgulu duruyor), ama kaydedilmemiş
-- bir sürenin geri dönüşü yok.
--
-- Kolon aynen duruyor; kalkan yalnızca "tek olabilir" kısıtı.

drop index if exists public.work_log_entries_tek_kronometre;

-- Yerine sıradan bir indeks: "çalışan kronometrelerim" sorgusu hâlâ sık ve
-- tekillik gitse de indeksin kendisi gerekli.
create index if not exists idx_work_log_entries_kronometre
  on public.work_log_entries (user_id)
  where timer_started_at is not null and archived_at is null;

comment on column public.work_log_entries.timer_started_at is
  'Dolu ise kronometre calisiyor. AYNI ANDA BIRDEN FAZLA olabilir (bkz. migration 101). Durunca gecen sure duration_minutes''a eklenir.';
