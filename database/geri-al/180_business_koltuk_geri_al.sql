-- 180'i geri alır: abonelik ve ödeme satırlarındaki koltuk sayısı silinir.
-- Koltukla alınmış Business abonelikleri sınırsız (eski) aboneliğe döner.
alter table public.paytr_abonelik_odemeleri drop column if exists koltuk;
alter table public.subscriptions drop column if exists koltuk;
