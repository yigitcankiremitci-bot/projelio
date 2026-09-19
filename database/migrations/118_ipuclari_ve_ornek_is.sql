-- 118 — Yeni üyeye iki yardım: günlük ipucu e-postası ve silinebilir örnek iş
--
-- SORUN: kayıt olan kişilerin bir kısmı geri dönmüyor, bir kısmı da girip ne
-- yapacağını bilmiyor. Boş bir ana sayfa "buraya ne yazmalıyım?" sorusunu
-- kullanıcıya bırakıyor; sihirbaz ve sesli tur ekranı tanıtıyor ama "bir görev
-- nasıl bir şey, alt görev ne işe yarar" sorusunu kurcalayarak öğrenmenin
-- yerini tutmuyor.
--
-- 1) İPUCU E-POSTALARI (notification_email_prefs)
--    Günde bir, sırayla, sınırlı sayıda (dizinin sonunda durur). Bildirim
--    e-postalarıyla AYNI tabloda çünkü aynı kişinin aynı saat dilimi ve aynı
--    "günlük saat" tercihi kullanılıyor; ayrı tablo, iki yerde saat dilimi
--    tutmak demekti. Ama ANAHTARI AYRI: bildirimleri kapatan kişi ipuçlarını
--    da kaybetmemeli, ipuçlarından sıkılan kişi de bildirimlerini.
--
--    Varsayılan AÇIK ve satırı olmayan kullanıcı da alır — günlük özetle aynı
--    gerekçe: kimse ayarlara girip açmaz, özellik fiilen kapalı kalırdı.
--
--    Dizide nerede kalındığı 119'daki `ipucu_gonderimleri` tablosunda: admin
--    ipuçlarını sıralayıp yenisini ekleyebildiği için ilerleme bir sayaçla
--    değil, "hangi ipucu gönderildi" kaydıyla tutuluyor.
--
-- 2) ÖRNEK İŞ (jobs.is_sample)
--    İlk girişte kullanıcının hesabına eğitici kartlarla dolu bir iş açılıyor
--    (Trello'nun örnek panosu gibi). İşaret İŞ düzeyinde: proje, görev ve
--    rutinler zaten işe bağlı ve işle birlikte siliniyor. "Örnekleri sil"
--    yalnızca bu işaretli işlere dokunur — kullanıcının kendi işi, adı ne
--    olursa olsun, asla bu yoldan silinemez.

alter table public.notification_email_prefs
  add column if not exists tips_enabled    boolean  not null default true,
  add column if not exists last_tip_on     date;

comment on column public.notification_email_prefs.tips_enabled is
  'Gunluk Projelio ipucu ve toplu duyuru e-postalari. Bildirim kanallarindan BAGIMSIZ; varsayilan acik.';
comment on column public.notification_email_prefs.last_tip_on is
  'Son ipucunun gonderildigi YEREL gun; ayni gun ikinci ipucunu engeller.';

alter table public.jobs
  add column if not exists is_sample boolean not null default false;

comment on column public.jobs.is_sample is
  'Ilk giriste acilan egitici ornek is. "Ornekleri sil" YALNIZCA bu isaretli islere dokunur.';

-- Kullanıcı başına EN FAZLA BİR örnek iş — TEKİL kısmi indeks. "Örnek iş
-- ekle" düğmesine iki kez basmak ya da sihirbazın bitişi ile ayarlardaki
-- düğmenin yarışması, kodda kontrol edilse bile aynı anda iki iş açabilirdi.
-- İkinci ekleme veritabanında reddediliyor, servis de mevcut olanı döndürüyor.
create unique index if not exists idx_jobs_ornek_tekil
  on public.jobs (owner_id)
  where is_sample;
