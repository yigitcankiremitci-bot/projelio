-- 098 — Yaptım: kayıtlı göreve bağlama, saat aralığı ve gerçekleşen süre
--
-- 097 kaydı SERBEST METİN olarak topluyordu: kullanıcı ne yaptığını yazıyor,
-- nereye ait olduğunu sonra seçiyordu. Eksik olan şuydu: yapılan iş çoğu zaman
-- sistemde ZATEN KAYITLI bir görev ya da alt görev. O görevi bulup Yaptım'a
-- bağlayabilmek, üç şeyi birden çözüyor:
--
--   1. Görev bulunduğu yerde (proje/departman panosunda) kapatılabiliyor —
--      kullanıcı aynı işi iki ekranda ayrı ayrı işaretlemiyor.
--   2. Harcanan süre görevin üstünde birikiyor; "bu iş ne kadar sürer"
--      sorusunun cevabı tahmin değil ÖLÇÜM oluyor.
--   3. Yapılan iş takvimde de yerini alıyor: gün geriye dönüp bakıldığında
--      saatlerin nereye gittiği görünüyor.
--
-- ---------------------------------------------------------------------------
-- 1) work_log_entries: saat aralığı + takvim bloğu bağı
-- ---------------------------------------------------------------------------
--
-- NEDEN AYRI İKİ DAMGA (duration_minutes'a ek olarak):
--   "45 dakika sürdü" ile "09:00–09:45 arası çalıştım" aynı bilgi DEĞİL.
--   İkincisi takvimde bir yer kaplıyor; ilkinden takvim bloğu üretmek için
--   saatin nereye oturacağını TAHMİN etmek gerekiyor. Kullanıcı saat aralığını
--   verdiğinde tahmin etmiyoruz.
--
--   duration_minutes yine de duruyor ve saat aralığı verildiğinde ondan
--   HESAPLANIYOR: özet/toplam sorgularının iki farklı alana bakması gerekmezdi
--   ve "süresi girilmemiş kayıt" sayacı yanlış çalışırdı.
--
-- NEDEN timestamp, time DEĞİL:
--   Gece yarısını geçen iş (23:30–00:15) `time` ile ifade edilemez; bitiş
--   başlangıçtan küçük görünür ve süre eksi çıkar.

alter table public.work_log_entries
  add column if not exists started_at timestamp,
  add column if not exists ended_at   timestamp,
  -- Kaydın takvimde açtığı blok. Kayıt silinince blok da silinsin diye
  -- tutuluyor; blok bağımsız olarak silinirse burası null'a düşer ve kayıt
  -- kalır (defter, takvimden daha kalıcıdır).
  add column if not exists time_block_id uuid references public.plan_time_blocks(id) on delete set null;

comment on column public.work_log_entries.started_at is
  'Isin baslangic ani. ended_at ile birlikte dolu olur; ikisinden duration_minutes hesaplanir.';
comment on column public.work_log_entries.time_block_id is
  'Bu kaydin takvimde actigi blok. Kayit arsivlenince blok da silinir.';

alter table public.work_log_entries
  drop constraint if exists work_log_entries_aralik_cifti;
alter table public.work_log_entries
  add constraint work_log_entries_aralik_cifti
  -- Tek başına bir başlangıç ya da tek başına bir bitiş hiçbir şey anlatmıyor;
  -- ikisi birlikte var ya da ikisi birlikte yok.
  check (num_nonnulls(started_at, ended_at) <> 1);

alter table public.work_log_entries
  drop constraint if exists work_log_entries_aralik_sirasi;
alter table public.work_log_entries
  add constraint work_log_entries_aralik_sirasi
  check (started_at is null or ended_at > started_at);

-- ---------------------------------------------------------------------------
-- 2) tasks: gerçekleşen süre
-- ---------------------------------------------------------------------------
--
-- NEDEN estimated_duration_* ÜZERİNE YAZILMIYOR:
--   O alan TAHMİN (arayüzdeki etiketi de "Tahmini süre"). Gerçekleşen süreyi
--   oraya yazmak, karşılaştırılacak baz değeri yok ederdi — oysa bu verinin
--   tek amacı "ne kadar sürer sanmıştık, ne kadar sürdü" sorusuna cevap
--   vermek. İki alan yan yana durunca tahmin zamanla düzeliyor; tek alan
--   olsaydı tahmin diye bakılan şey aslında geçmişin kendisi olurdu.
--
-- NEDEN DAKİKA:
--   estimated_duration_* saat/gün cinsinden ve ondalıklı. Ölçülen süre
--   dakikadan geliyor (kronometre, saat aralığı); saate çevirip saklamak her
--   toplamada yuvarlama hatası biriktirirdi. Gösterirken çevrilir.
--
-- Değer BİRİKİR: aynı göreve gün içinde iki kez dönmek yaygın, ikinci kayıt
-- birincinin süresini silmemeli (bkz. TasksService.addActualDuration).

alter table public.tasks
  add column if not exists actual_duration_minutes integer;

comment on column public.tasks.actual_duration_minutes is
  'Yaptim kayitlarindan biriken GERCEKLESEN sure (dakika). estimated_duration_* TAHMIN''dir, ayridir.';

alter table public.tasks
  drop constraint if exists tasks_actual_duration_pozitif;
alter table public.tasks
  add constraint tasks_actual_duration_pozitif
  check (actual_duration_minutes is null or actual_duration_minutes > 0);

-- "Bu görevde ne kadar çalışılmış" sorgusu görevin kendisinden okunuyor,
-- ayrı bir indekse gerek yok. Ama Yaptım kayıtlarını göreve göre listelemek
-- (görev ekranında "harcanan süre nereden geldi") indeks istiyor.
create index if not exists idx_work_log_entries_hedef
  on public.work_log_entries (target_kind, target_id)
  where archived_at is null and target_kind is not null;
