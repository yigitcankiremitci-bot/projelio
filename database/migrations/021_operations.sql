-- 021_operations.sql
-- Programlar (kod adı: operations)
--
-- Proje geçicidir: başı ve sonu vardır, benzersiz bir çıktı üretir, biter.
-- Program süreklidir: bitiş tarihi yoktur, tekrarlayan işlerden oluşur, durdurulur.
-- (PMBOK ayrımıyla: project vs. operations.)
--
-- Bu yüzden programda deadline, toplam bütçe ve "tamamlandı" durumu yoktur;
-- yerine dönemsel bütçe, duraklatma ve uyum oranı (adherence) vardır.
-- Program, jobs altında projects'in kardeşidir.

-- =============================================================== 1. Programlar

create table public.operations (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references public.users(id),
  job_id            uuid not null references public.jobs(id),
  title             varchar not null,
  description       text,
  cover_image_url   text,
  -- programın 'completed' hâli yoktur; ya çalışır, ya duraklar, ya kapatılır
  status            varchar not null default 'active'
                      check (status in ('active','paused','ended')),
  started_on        date not null default current_date,
  ended_on          date,
  -- toplam bütçe değil, çalışma hızı (run-rate)
  budget_per_period numeric not null default 0,
  budget_period     varchar not null default 'monthly'
                      check (budget_period in ('weekly','monthly','yearly')),
  timezone          text not null default 'Europe/Istanbul',
  sort_order        integer not null default 0,
  archived_at       timestamp,
  created_at        timestamp not null default current_timestamp,
  constraint operations_end_after_start
    check (ended_on is null or ended_on >= started_on),
  constraint operations_ended_requires_date
    check (status <> 'ended' or ended_on is not null)
);

comment on table public.operations is
  'Program: süresi olmayan, tekrarlayan işlerden oluşan çalışma. jobs altında projects ile kardeş. PMBOK terimiyle "operations".';
comment on column public.operations.budget_per_period is
  'Programın dönemsel çalışma maliyeti. Projedeki total_budget''in karşılığı değil; bitiş olmadığı için toplam bütçe anlamsızdır.';

create index operations_job_id_idx   on public.operations(job_id);
create index operations_owner_id_idx on public.operations(owner_id);
create index operations_status_idx   on public.operations(status) where archived_at is null;

create table public.operation_members (
  id                 uuid primary key default gen_random_uuid(),
  operation_id       uuid not null references public.operations(id) on delete cascade,
  user_id            uuid not null references public.users(id),
  role               varchar not null default 'member'
                       check (role in ('owner','member','subcontractor')),
  status             varchar not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  custom_agreed_rate numeric,
  can_view_budget    boolean not null default false,
  title              varchar,
  joined_at          timestamp not null default current_timestamp,
  unique (operation_id, user_id)
);

create index operation_members_user_id_idx on public.operation_members(user_id);

alter table public.operations        enable row level security;
alter table public.operation_members enable row level security;

-- ================================================================= 2. Rutinler
-- Rutin, programın tekrar kuralıdır — görevin kendisi değil, görev şablonu.
-- Alanlar RFC 5545 (iCalendar RRULE) semantiğine göre adlandırılmıştır.

create table public.operation_routines (
  id                   uuid primary key default gen_random_uuid(),
  operation_id         uuid not null references public.operations(id) on delete cascade,
  title                varchar not null,
  description          text,
  default_assignee     uuid references public.users(id),

  -- ---- tekrar kuralı ----
  freq                 varchar not null check (freq in ('daily','weekly','monthly','yearly')),
  interval_n           integer not null default 1 check (interval_n between 1 and 366),
  byweekday            smallint[],   -- 0=Pazar .. 6=Cumartesi
  bymonthday           smallint[],   -- 1..31, -1 = ayın son günü
  bysetpos             smallint check (bysetpos is null or bysetpos in (1,2,3,4,5,-1)), -- "ayın 2. Salısı"
  bymonth              smallint[],   -- 1..12 (yıllık)

  starts_on            date not null default current_date,
  ends_on              date,         -- null = süresiz
  max_occurrences      integer check (max_occurrences is null or max_occurrences > 0),

  -- ---- görev üretimi ----
  due_time             time not null default '18:00',
  lead_days            integer not null default 0 check (lead_days >= 0),
  grace_days           integer not null default 0 check (grace_days >= 0),
  generate_ahead_days  integer not null default 30 check (generate_ahead_days between 1 and 365),
  budget               numeric not null default 0,  -- tekrar başına

  active               boolean not null default true,
  sort_order           integer not null default 0,
  archived_at          timestamp,
  last_materialized_on date,
  created_at           timestamp not null default current_timestamp,

  constraint routines_end_after_start check (ends_on is null or ends_on >= starts_on),
  constraint routines_weekday_range   check (byweekday <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint routines_month_range     check (bymonth   <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]),
  constraint routines_setpos_needs_weekday check (bysetpos is null or byweekday is not null),
  constraint routines_setpos_monthly_only  check (bysetpos is null or freq = 'monthly')
);

comment on table public.operation_routines is
  'Programın tekrar eden iş tanımı (şablon). Görevler bu şablondan üretilir; şablonun kendisi görev değildir.';
comment on column public.operation_routines.bymonthday is
  '-1 ayın son günü demektir. 29/30/31 gibi değerler o ayda yoksa RFC 5545 gibi o ay atlanır.';
comment on column public.operation_routines.grace_days is
  'Vade + grace_days geçtiği hâlde tamamlanmayan tekrar "kaçırıldı" sayılır.';

create index operation_routines_operation_id_idx on public.operation_routines(operation_id);
create index operation_routines_active_idx       on public.operation_routines(active) where archived_at is null;

alter table public.operation_routines enable row level security;

-- ======================================================= 3. Tekrarlar → tasks
-- Tekrarlar ayrı bir tabloda değil, tasks içinde yaşar: yorumlar, atama,
-- aktif görev takibi, bütçe durumu gibi mevcut mekanizmalar böylece bedava çalışır.

alter table public.tasks
  add column operation_id  uuid references public.operations(id) on delete cascade,
  add column routine_id    uuid references public.operation_routines(id) on delete cascade,
  add column occurrence_on date,
  add column skipped_at    timestamp;

comment on column public.tasks.occurrence_on is
  'Bu görev hangi tekrar tarihine ait. routine_id ile birlikte tekilliği sağlar.';
comment on column public.tasks.skipped_at is
  'Bu tekrar bilinçli olarak atlandı. Kaçırılmış sayılmaz, uyum oranında paydaya girmez.';

-- Bir görev ya projeye ya programa aittir; ikisine birden veya hiçbirine ait olamaz.
alter table public.tasks
  add constraint tasks_single_parent
    check (num_nonnulls(project_id, operation_id) = 1);

alter table public.tasks
  add constraint tasks_routine_requires_operation
    check (routine_id is null or operation_id is not null),
  add constraint tasks_routine_requires_occurrence
    check ((routine_id is null) = (occurrence_on is null));

-- Aynı rutin + aynı tarih iki kez üretilemez (idempotent materialization)
alter table public.tasks
  add constraint tasks_routine_occurrence_unique unique (routine_id, occurrence_on);

create index tasks_operation_id_idx on public.tasks(operation_id) where operation_id is not null;
create index tasks_occurrence_idx   on public.tasks(occurrence_on) where occurrence_on is not null;

-- ============================================= 4. Bütçe, ödeme ve akış bağları

alter table public.budget_transactions
  add column operation_id uuid references public.operations(id) on delete cascade;
alter table public.budget_transactions
  add constraint budget_tx_single_parent
    check (num_nonnulls(project_id, operation_id) <= 1);
create index budget_transactions_operation_id_idx
  on public.budget_transactions(operation_id) where operation_id is not null;

-- Düzenli ödemeler (abonelik, maaş, kira) doğal olarak programlara aittir
alter table public.recurring_payments
  add column operation_id uuid references public.operations(id) on delete cascade;
alter table public.recurring_payments
  add constraint recurring_payments_single_parent
    check (num_nonnulls(project_id, operation_id) <= 1);
create index recurring_payments_operation_id_idx
  on public.recurring_payments(operation_id) where operation_id is not null;

alter table public.project_posts
  add column operation_id uuid references public.operations(id) on delete cascade;
alter table public.project_posts
  add constraint project_posts_single_parent
    check (num_nonnulls(project_id, operation_id) = 1);
create index project_posts_operation_id_idx
  on public.project_posts(operation_id) where operation_id is not null;

-- =================================================== 5. Tekrar açma (RRULE) motoru
-- Çekirdek genişletici parametrelerden çalışır; böylece henüz KAYDEDİLMEMİŞ bir
-- rutin için de canlı önizleme üretilebilir. Önizleme ile gerçek üretim aynı
-- fonksiyonu kullandığı için asla ayrışamazlar.

create or replace function public.expand_recurrence(
  p_freq        text,
  p_interval_n  integer,
  p_byweekday   smallint[],
  p_bymonthday  smallint[],
  p_bysetpos    smallint,
  p_bymonth     smallint[],
  p_starts_on   date,
  p_ends_on     date,
  p_from        date,
  p_to          date
) returns setof date
language plpgsql stable
set search_path = public, pg_temp
as $$
declare
  v_from date;
  v_to   date;
  v_int  integer := greatest(coalesce(p_interval_n, 1), 1);
begin
  if p_starts_on is null or p_freq is null then return; end if;

  v_from := greatest(p_from, p_starts_on);
  v_to   := p_to;
  if p_ends_on is not null then v_to := least(v_to, p_ends_on); end if;
  if v_to is null or v_from is null or v_to < v_from then return; end if;

  return query
  select dd
  from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g(ts),
       lateral (select g.ts::date) s(dd)
  where case p_freq

    when 'daily' then
      ((dd - p_starts_on) % v_int) = 0

    when 'weekly' then
      extract(dow from dd)::smallint = any(
        coalesce(p_byweekday, array[extract(dow from p_starts_on)::smallint])
      )
      and (
        ((date_trunc('week', dd::timestamp)::date
          - date_trunc('week', p_starts_on::timestamp)::date) / 7) % v_int
      ) = 0

    when 'monthly' then
      ((
        (extract(year  from dd)::int - extract(year  from p_starts_on)::int) * 12
      + (extract(month from dd)::int - extract(month from p_starts_on)::int)
      ) % v_int) = 0
      and (
        case
          -- "ayın N. Salısı" kalıbı
          when p_bysetpos is not null and p_byweekday is not null then
            extract(dow from dd)::smallint = any(p_byweekday)
            and (
              case when p_bysetpos > 0
                then ((extract(day from dd)::int - 1) / 7) + 1 = p_bysetpos
                else (date_trunc('month', dd::timestamp) + interval '1 month' - interval '1 day')::date - dd < 7
              end
            )
          else
            extract(day from dd)::smallint = any(
              coalesce(p_bymonthday, array[extract(day from p_starts_on)::smallint])
            )
            -- -1 = ayın son günü
            or ( p_bymonthday is not null
                 and -1 = any(p_bymonthday)
                 and dd = (date_trunc('month', dd::timestamp) + interval '1 month' - interval '1 day')::date )
        end
      )

    when 'yearly' then
      ((extract(year from dd)::int - extract(year from p_starts_on)::int) % v_int) = 0
      and extract(month from dd)::smallint = any(
        coalesce(p_bymonth, array[extract(month from p_starts_on)::smallint])
      )
      and extract(day from dd)::smallint = any(
        coalesce(p_bymonthday, array[extract(day from p_starts_on)::smallint])
      )

    else false
  end
  order by dd;
end;
$$;

comment on function public.expand_recurrence is
  'Tekrar kuralını parametrelerden genişletir. Rutin oluşturma ekranındaki canlı önizleme bunu kullanır.';

-- Kayıtlı rutin için ince sarmalayıcı
create or replace function public.operation_routine_dates(
  p_routine_id uuid,
  p_from       date,
  p_to         date
) returns setof date
language plpgsql stable
set search_path = public, pg_temp
as $$
declare r public.operation_routines%rowtype;
begin
  select * into r from public.operation_routines where id = p_routine_id;
  if not found then return; end if;

  return query
  select * from public.expand_recurrence(
    r.freq, r.interval_n, r.byweekday, r.bymonthday, r.bysetpos, r.bymonth,
    r.starts_on, r.ends_on, p_from, p_to
  );
end;
$$;

-- Tek bir rutinin yaklaşan tekrarlarını görev olarak açar. Idempotenttir.
create or replace function public.materialize_operation_routine(p_routine_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        public.operation_routines%rowtype;
  o        public.operations%rowtype;
  d        date;
  existing integer;
  inserted integer;
  total    integer := 0;
begin
  select * into r from public.operation_routines where id = p_routine_id;
  if not found or not r.active or r.archived_at is not null then return 0; end if;

  select * into o from public.operations where id = r.operation_id;
  -- duraklatılmış/kapatılmış program yeni tekrar üretmez
  if not found or o.status <> 'active' or o.archived_at is not null then return 0; end if;

  select count(*) into existing from public.tasks where routine_id = r.id;

  for d in
    select * from public.operation_routine_dates(r.id, current_date, current_date + r.generate_ahead_days)
  loop
    exit when r.max_occurrences is not null and existing >= r.max_occurrences;

    insert into public.tasks (
      project_id, operation_id, routine_id, occurrence_on,
      title, description, assigned_to, start_date, deadline,
      budget, status, sort_order
    ) values (
      null, r.operation_id, r.id, d,
      r.title, r.description, r.default_assignee,
      ((d - r.lead_days)::timestamp + r.due_time),
      (d::timestamp + r.due_time),
      r.budget, 'todo', r.sort_order
    )
    on conflict (routine_id, occurrence_on) do nothing;

    get diagnostics inserted = row_count;
    total    := total + inserted;
    existing := existing + inserted;
  end loop;

  update public.operation_routines set last_materialized_on = current_date where id = r.id;
  return total;
end;
$$;

comment on function public.materialize_operation_routine(uuid) is
  'Rutinin generate_ahead_days penceresindeki tekrarlarını tasks tablosuna açar. Tekrar çağrılabilir, kopya üretmez.';

-- Tüm aktif rutinleri işler. Gecelik cron bunu çağırır.
create or replace function public.materialize_all_operations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare rec record; total integer := 0;
begin
  for rec in
    select r.id
      from public.operation_routines r
      join public.operations o on o.id = r.operation_id
     where r.active and r.archived_at is null
       and o.status = 'active' and o.archived_at is null
       and (r.ends_on is null or r.ends_on >= current_date)
  loop
    total := total + public.materialize_operation_routine(rec.id);
  end loop;
  return total;
end;
$$;

-- ========================================= 6. Takvim değişince yeniden senkron
-- Silme koşulu her zaman "gelecek + dokunulmamış": geçmiş ve üzerinde
-- çalışılmış hiçbir görev kaybolmaz.

create or replace function public.resync_operation_routine(p_routine_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.tasks
   where routine_id    = p_routine_id
     and occurrence_on > current_date
     and status        = 'todo'
     and completed_at is null
     and skipped_at   is null;

  return public.materialize_operation_routine(p_routine_id);
end;
$$;

comment on function public.resync_operation_routine(uuid) is
  'Gelecekteki dokunulmamış tekrarları silip yeniden üretir. Geçmiş ve üzerinde çalışılmış görevler korunur.';

create or replace function public.trg_operation_routines_resync()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.materialize_operation_routine(new.id);
  else
    if new.active and new.archived_at is null then
      perform public.resync_operation_routine(new.id);
    else
      -- pasifleşen rutin gelecekteki tekrarlarını bırakır
      delete from public.tasks
       where routine_id    = new.id
         and occurrence_on > current_date
         and status        = 'todo'
         and completed_at is null
         and skipped_at   is null;
    end if;
  end if;
  return null;
end;
$$;

create trigger operation_routines_resync
after insert or update of
  freq, interval_n, byweekday, bymonthday, bysetpos, bymonth,
  starts_on, ends_on, max_occurrences, due_time, lead_days,
  generate_ahead_days, active, archived_at, default_assignee, title, budget
on public.operation_routines
for each row
when (pg_trigger_depth() = 0)
execute function public.trg_operation_routines_resync();

-- Program duraklatılınca/kapatılınca gelecekteki tekrarlar çekilir; tekrar açılınca geri gelir.
create or replace function public.trg_operations_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' and new.archived_at is null then
    perform public.materialize_operation_routine(r.id)
       from public.operation_routines r
      where r.operation_id = new.id and r.active and r.archived_at is null;
  else
    delete from public.tasks
     where operation_id  = new.id
       and occurrence_on > current_date
       and status        = 'todo'
       and completed_at is null
       and skipped_at   is null;
  end if;
  return null;
end;
$$;

create trigger operations_status_change
after update of status, archived_at on public.operations
for each row
when (pg_trigger_depth() = 0
      and (old.status is distinct from new.status
           or old.archived_at is distinct from new.archived_at))
execute function public.trg_operations_status_change();

-- ============================================ 7. Sağlık metrikleri (view'lar)
-- Programda "%kaç tamamlandı" anlamsızdır (bitiş yok, payda sonsuz).
-- Doğru metrikler: uyum oranı (adherence), seri (streak), kaçırılan sayısı.

create or replace function public.operation_routine_streak(p_routine_id uuid)
returns integer
language sql stable
set search_path = public, pg_temp
as $$
  with occ as (
    select status, row_number() over (order by occurrence_on desc) as rn
      from public.tasks
     where routine_id     = p_routine_id
       and occurrence_on <= current_date
       and skipped_at    is null
  )
  select coalesce(
           (select min(rn) from occ where status <> 'completed'),
           (select count(*) + 1 from occ)
         )::integer - 1;
$$;

comment on function public.operation_routine_streak(uuid) is
  'Bugünden geriye doğru kesintisiz tamamlanmış tekrar sayısı. Bilinçli atlananlar seriyi bozmaz.';

create or replace view public.operation_routine_stats
with (security_invoker = true) as
select
  r.id as routine_id,
  r.operation_id,
  r.title,
  r.active,
  count(t.id) filter (where t.occurrence_on <= current_date and t.skipped_at is null)                            as due_count,
  count(t.id) filter (where t.occurrence_on <= current_date and t.skipped_at is null and t.status = 'completed') as done_count,
  count(t.id) filter (where t.skipped_at is not null)                                                            as skipped_count,
  count(t.id) filter (where t.occurrence_on + r.grace_days < current_date
                        and t.skipped_at is null and t.status <> 'completed')                                    as missed_count,
  count(t.id) filter (where t.occurrence_on > current_date)                                                      as upcoming_count,
  round(
    100.0 * count(t.id) filter (where t.occurrence_on <= current_date and t.skipped_at is null and t.status = 'completed')
    / nullif(count(t.id) filter (where t.occurrence_on <= current_date and t.skipped_at is null), 0)
  , 1)                                                                                                           as adherence_pct,
  round(
    100.0 * count(t.id) filter (where t.occurrence_on between current_date - 90 and current_date
                                  and t.skipped_at is null and t.status = 'completed')
    / nullif(count(t.id) filter (where t.occurrence_on between current_date - 90 and current_date
                                   and t.skipped_at is null), 0)
  , 1)                                                                                                           as adherence_90d_pct,
  public.operation_routine_streak(r.id)                                                                          as current_streak,
  min(t.occurrence_on) filter (where t.occurrence_on >= current_date and t.status <> 'completed')                 as next_due_on,
  max(t.occurrence_on) filter (where t.status = 'completed')                                                      as last_done_on
from public.operation_routines r
left join public.tasks t on t.routine_id = r.id
where r.archived_at is null
group by r.id;

create or replace view public.operation_health
with (security_invoker = true) as
select
  o.id as operation_id,
  o.job_id,
  o.title,
  o.status,
  count(distinct r.id) filter (where r.active)                      as active_routine_count,
  coalesce(sum(s.due_count), 0)                                     as due_count,
  coalesce(sum(s.done_count), 0)                                    as done_count,
  coalesce(sum(s.missed_count), 0)                                  as missed_count,
  coalesce(sum(s.upcoming_count), 0)                                as upcoming_count,
  round(100.0 * sum(s.done_count) / nullif(sum(s.due_count), 0), 1) as adherence_pct,
  min(s.next_due_on)                                                as next_due_on,
  -- programın "ilerleme çubuğu" karşılığı
  case
    when count(r.id) filter (where r.active) = 0 then 'idle'
    when coalesce(sum(s.missed_count), 0) = 0     then 'healthy'
    when round(100.0 * sum(s.done_count) / nullif(sum(s.due_count), 0), 1) >= 80 then 'at_risk'
    else 'failing'
  end                                                               as health
from public.operations o
left join public.operation_routines r on r.operation_id = o.id and r.archived_at is null
left join public.operation_routine_stats s on s.routine_id = r.id
where o.archived_at is null
group by o.id;

comment on view public.operation_health is
  'Programın proje ilerleme çubuğu karşılığı: yüzde tamamlanma yerine uyum oranı + kaçırılan sayısı + sağlık durumu.';

-- Bir iş altındaki projeler ve programlar tek listede
create or replace view public.job_items
with (security_invoker = true) as
select
  p.id, 'project'::text as kind, p.job_id, p.owner_id, p.title, p.description,
  p.cover_image_url, p.status, p.start_date as starts_on, p.deadline as ends_on,
  p.sort_order, p.archived_at, p.created_at,
  round(100.0 * count(t.id) filter (where t.status = 'completed')
        / nullif(count(t.id), 0), 1) as progress_pct,
  null::numeric as adherence_pct,
  null::text    as health
from public.projects p
left join public.tasks t on t.project_id = p.id and t.archived_at is null
group by p.id
union all
select
  o.id, 'program'::text as kind, o.job_id, o.owner_id, o.title, o.description,
  o.cover_image_url, o.status, o.started_on as starts_on, o.ended_on as ends_on,
  o.sort_order, o.archived_at, o.created_at,
  null::numeric as progress_pct,
  h.adherence_pct,
  h.health
from public.operations o
left join public.operation_health h on h.operation_id = o.id;

comment on view public.job_items is
  'jobs altındaki projeler + programlar. progress_pct sadece projelerde, adherence_pct/health sadece programlarda doludur.';

-- ================================================================ 8. Güvenlik
-- Yazan fonksiyonlar REST üzerinden çağrılamaz; sadece service_role ve cron.

revoke execute on function public.materialize_operation_routine(uuid) from public, anon, authenticated;
revoke execute on function public.materialize_all_operations()        from public, anon, authenticated;
revoke execute on function public.resync_operation_routine(uuid)      from public, anon, authenticated;
revoke execute on function public.trg_operation_routines_resync()     from public, anon, authenticated;
revoke execute on function public.trg_operations_status_change()      from public, anon, authenticated;

grant execute on function public.materialize_operation_routine(uuid) to service_role;
grant execute on function public.materialize_all_operations()        to service_role;
grant execute on function public.resync_operation_routine(uuid)      to service_role;

-- ==================================================== 9. Gecelik üretim (cron)
-- Tetikleyiciler anlık üretimi hallediyor; cron ise generate_ahead_days
-- penceresini her gün ileri kaydırır.

create extension if not exists pg_cron;

select cron.schedule(
  'materialize-operations-nightly',
  '15 0 * * *',
  $$select public.materialize_all_operations();$$
);
