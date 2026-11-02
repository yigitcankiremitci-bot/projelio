-- 180_business_koltuk.sql
-- Business kişi sayısıyla fiyatlanıyor (kullanıcı kararı, 2026-11-02).
--
-- Eskiden 24,99 $'a 10 kişiydi ve bu sınır hiçbir yerde uygulanmıyordu. Artık
-- taban fiyata 3 kişi dahil, her ek kişi ayrıca ödenir; kişi sayısı SATIN
-- ALIRKEN seçilir ve koltuk dolunca şirkete yeni üye eklenemez.
--
--   subscriptions.koltuk               Aboneliğin satın aldığı kişi sayısı. BOŞ =
--                                      bu migration'dan önce alınmış Business ya
--                                      da koltuksuz paket: eski tutar, eski bakiye,
--                                      sınır yok.
--   paytr_abonelik_odemeleri.koltuk    Ödeme formu açılırken seçilen sayı; ilk
--                                      ödeme bildirimi aboneliği bununla açar
--                                      (tarayıcıdan gelen değere güvenilmez).

alter table public.subscriptions add column if not exists koltuk integer;
alter table public.subscriptions drop constraint if exists subscriptions_koltuk_check;
alter table public.subscriptions add constraint subscriptions_koltuk_check check (koltuk is null or koltuk >= 1);

alter table public.paytr_abonelik_odemeleri add column if not exists koltuk integer;
alter table public.paytr_abonelik_odemeleri drop constraint if exists paytr_abonelik_odemeleri_koltuk_check;
alter table public.paytr_abonelik_odemeleri
  add constraint paytr_abonelik_odemeleri_koltuk_check check (koltuk is null or koltuk >= 1);
