-- 029_department_tasks_and_budget.sql
-- Departman içi dinamikler: Görevler (çıktı/görev/alt görev) ve Bütçe sekmeleri.
-- Aynı "tasks"/"outputs"/"budget_transactions" tabloları, 021_operations.sql'de
-- project_id/operation_id için kurulan polimorfik desen genişletilerek
-- department_id ile de kullanılabilir hale getiriliyor — yeni paralel tablo yok.

-- ============================================================== 1. outputs
-- Artık bir çıktı ya bir projeye ya bir departmana ait olabilir (ikisine birden değil).
alter table public.outputs
  alter column project_id drop not null,
  add column department_id uuid references public.departments(id) on delete cascade;

alter table public.outputs
  add constraint outputs_single_parent
    check (num_nonnulls(project_id, department_id) = 1);

create index outputs_department_id_idx on public.outputs(department_id) where department_id is not null;

-- ================================================================ 2. tasks
alter table public.tasks
  add column department_id uuid references public.departments(id) on delete cascade;

alter table public.tasks
  drop constraint tasks_single_parent,
  add constraint tasks_single_parent
    check (num_nonnulls(project_id, operation_id, department_id) = 1);

create index tasks_department_id_idx on public.tasks(department_id) where department_id is not null;

-- ==================================================== 3. budget_transactions
alter table public.budget_transactions
  add column department_id uuid references public.departments(id) on delete cascade;

alter table public.budget_transactions
  drop constraint budget_tx_single_parent,
  add constraint budget_tx_single_parent
    check (num_nonnulls(project_id, operation_id, department_id) <= 1);

create index budget_transactions_department_id_idx
  on public.budget_transactions(department_id) where department_id is not null;
