-- 103 — Yaptım: "duraklatıldı" ile "bitti" ayrı durumlar
--
-- 102'de duraklatma eklendi ama veritabanında duraklatılmış kayıt ile
-- bitirilmiş kayıt AYNI görünüyordu: ikisinde de timer_started_at boş, sadece
-- timer_seconds dolu. Sonuç: ara veren kullanıcı ekranda kaydını BİTMİŞ gibi
-- görüyordu ve devam etmesi gerektiğini hatırlatan hiçbir şey yoktu.
--
-- Ara vermek, işi bitirmekle aynı şey değil: biri "geri döneceğim" der, diğeri
-- "bitti" der. Ayrımı kullanıcı yapıyor ama sistem tutmuyordu.
--
-- Bu kolonla üç durum ayrışıyor:
--   timer_started_at dolu                      -> çalışıyor
--   boş + timer_paused true                    -> duraklatıldı (ekranda yanıp söner)
--   boş + timer_paused false                   -> bitti (ya da hiç başlamadı)

alter table public.work_log_entries
  add column if not exists timer_paused boolean not null default false;

comment on column public.work_log_entries.timer_paused is
  'Kronometre DURAKLATILDI mi (bitirilmedi). timer_started_at bos + bu true ise kullanici geri donecek demektir.';

-- Çalışan bir kronometre duraklatılmış olamaz; ikisi bir arada anlamsız bir
-- durum ve arayüz hangisini göstereceğini bilemezdi.
alter table public.work_log_entries
  drop constraint if exists work_log_entries_duraklatma_tutarli;
alter table public.work_log_entries
  add constraint work_log_entries_duraklatma_tutarli
  check (not (timer_started_at is not null and timer_paused));
