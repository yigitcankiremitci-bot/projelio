-- 105 GERİ ALMA
--
-- Bu dosyayı yalnızca migration 105 beklenmedik bir soruna yol açarsa
-- çalıştırın.
--
-- ⚠️ VERİ KAYBI VAR, iki yerde:
--   1. 3 aylık / 6 aylık düzenli ödemeler eski kısıta uymaz — AYLIĞA çevrilir.
--      Tutarları aynı kalır, yani aylığa dönen bir 6 aylık ödeme altı kat
--      fazla kesmeye başlar. Geri aldıktan sonra bu satırları elle gözden
--      geçirin:
--        select id, description, amount, interval from recurring_payments
--         where interval = 'monthly' order by created_at desc;
--   2. Elle kurulan görev bağları silinir (aşağıdaki açıklamaya bakın).

-- ========================================= 1. Yeni aralıkları aylığa indirge
update public.recurring_payments set interval = 'monthly' where interval in ('quarterly', 'semiannual');

alter table public.recurring_payments drop constraint if exists recurring_payments_interval_check;
alter table public.recurring_payments
  add constraint recurring_payments_interval_check
    check (interval in ('weekly', 'monthly', 'yearly'));

alter table public.recurring_payments drop column if exists task_id;

-- ================================== 2. Görev bağı: yalnızca otomatik olan kalır
--
-- 104'teki tekil indeks geri geliyor ve o indeks, aynı göreve bağlı birden
-- fazla satırı KABUL ETMEZ. Bu yüzden elle kurulan bağlar (source='manual' ve
-- task_id dolu) temizleniyor — kaydın kendisi DURUYOR, yalnızca görevle
-- ilişkisi kopuyor. Tutarlar ve toplamlar değişmez.
update public.budget_transactions set task_id = null where source = 'manual' and task_id is not null;

drop index if exists budget_transactions_task_odeme_uniq;
drop index if exists budget_transactions_task_idx;

create unique index if not exists budget_transactions_task_uniq
  on public.budget_transactions(task_id) where task_id is not null;

-- ============================================================ 3. Kaynak alanı
alter table public.budget_transactions drop constraint if exists budget_transactions_source_check;
alter table public.budget_transactions drop column if exists source;
