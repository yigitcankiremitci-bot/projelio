-- 104 GERİ ALMA
--
-- Bu dosyayı yalnızca migration 104 beklenmedik bir soruna yol açarsa
-- çalıştırın.
--
-- ⚠️ TAM GERİ DÖNÜŞ DEĞİLDİR. 104, fm_gelir_gider modülünün kayıtlarını
-- budget_transactions'a TAŞIDI ve modülü katalogdan sildi; katalog satırının
-- silinmesi module_records satırlarını da CASCADE ile götürdü. O kayıtların
-- jsonb hâli artık yok — aşağıdaki betik onları module_records'a GERİ YAZAR
-- ama yalnızca 104'ün taşıdığı alanlarla (tür, tutar, para birimi, kategori,
-- tarih, açıklama). Modülün kayıt kimlikleri (id) ve varsa data içindeki
-- tanınmayan ek alanlar geri gelmez.
--
-- Bu yüzden geri almadan ÖNCE yedek alın:
--   ./deploy/yedekle.sh     (ya da pg_dump)

-- =================================== 1. Katalog satırını ve modülü geri getir
insert into public.module_catalog (key, department_key, name, description, scope, sort_order)
values ('fm_gelir_gider', 'finans_muhasebe', 'Gelir-Gider Modülü', null, 'organization', 10)
on conflict (key) do nothing;

-- Şirket kademesine (organization_id) yazılmış kayıtlar modülden gelmiş
-- olanlardır: 104 öncesinde bu sütun YOKTU, dolayısıyla dolu olan her satır
-- ya taşımadan ya da 104 sonrası girilen yeni kayıtlardan geliyor. İkisi de
-- modüle geri yazılır — şirket defterinin tamamı orada toplanır.
insert into public.module_records (organization_id, module_key, data, created_by, created_at)
select
  bt.organization_id,
  'fm_gelir_gider',
  jsonb_strip_nulls(jsonb_build_object(
    'type',        bt.type,
    'amount',      bt.amount,
    'currency',    bt.currency,
    'category',    bt.category,
    'entryDate',   to_char(bt.occurred_at, 'YYYY-MM-DD'),
    'description', bt.description
  )),
  bt.created_by,
  bt.created_at
from public.budget_transactions bt
where bt.organization_id is not null;

-- ============================================ 2. Deftere eklenen kademeleri sil
-- Şirket ve holding satırları modüle geri yazıldı; iş kademesinin 104 öncesinde
-- karşılığı hiç yoktu, o kayıtlar KAYBOLUR (uyarı yukarıda).
delete from public.budget_transactions where organization_id is not null or group_id is not null or job_id is not null;

alter table public.budget_transactions drop constraint if exists budget_tx_single_parent;
alter table public.budget_transactions
  drop column if exists job_id,
  drop column if exists organization_id,
  drop column if exists group_id,
  drop column if exists currency,
  drop column if exists category,
  drop column if exists counterparty_id,
  drop column if exists created_by,
  drop column if exists task_id;
alter table public.budget_transactions
  add constraint budget_tx_single_parent
    check (num_nonnulls(project_id, operation_id, department_id) <= 1);

-- ==================================================== 3. Görev onay izi ve tablo
alter table public.tasks drop constraint if exists tasks_budget_status_check;
-- Reddedilmiş görevler eski kısıta uymaz; 'pending'e döndürülüyorlar.
update public.tasks set budget_status = 'pending' where budget_status = 'rejected';
alter table public.tasks
  add constraint tasks_budget_status_check
    check (budget_status in ('pending', 'planned', 'paid'));

alter table public.tasks
  drop column if exists budget_currency,
  drop column if exists budget_requested_by,
  drop column if exists budget_requested_at,
  drop column if exists budget_decided_by,
  drop column if exists budget_decided_at,
  drop column if exists budget_note;

drop table if exists public.budget_viewers;

-- ======================================================== 4. Düzenli ödemeler
alter table public.recurring_payments drop constraint if exists recurring_payments_single_parent;
delete from public.recurring_payments
  where department_id is not null or job_id is not null or organization_id is not null or group_id is not null;
alter table public.recurring_payments
  drop column if exists department_id,
  drop column if exists job_id,
  drop column if exists organization_id,
  drop column if exists group_id,
  drop column if exists currency,
  drop column if exists category;
