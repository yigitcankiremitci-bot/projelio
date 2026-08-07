-- 038 — Yapılacaklar: kişisel kanban panosu
--
-- Kullanıcının kendine ait çalışma alanı. İki tür kart barındırır:
--   personal_todos      : projelerden bağımsız, YALNIZCA kullanıcının gördüğü görevler
--   personal_task_prefs : kullanıcıya ATANAN görevlerin kişisel katmanı
--                         (sıra, gizli not, kişisel hedef tarih, sabitle/gizle)
-- Bu katman tasks tablosuna dokunmaz: kullanıcı kendi düzenini kurarken
-- ekiple senkron bozulmaz.
--
-- Kolonlar SABİT: todo | in_progress | completed (tasks.status ile birebir).

-- ---------------------------------------------------------------------------
-- 1) Kişisel görevler
-- ---------------------------------------------------------------------------
create table if not exists public.personal_todos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  title         varchar(255) not null,
  description   text,
  status        varchar(20) not null default 'todo',
  priority      varchar(10) not null default 'normal',
  color         varchar(7),
  due_date      timestamp,
  sort_order    integer not null default 0,
  completed_at  timestamp,
  archived_at   timestamp,
  created_at    timestamp not null default current_timestamp,
  updated_at    timestamp not null default current_timestamp,

  constraint personal_todos_status_check
    check (status in ('todo','in_progress','completed')),
  constraint personal_todos_priority_check
    check (priority in ('low','normal','high')),
  constraint personal_todos_title_not_blank
    check (length(btrim(title)) > 0),
  constraint personal_todos_color_hex
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  -- 'completed' durumu ile completed_at birbirini zorunlu kılar; ikisi asla ayrışmaz.
  constraint personal_todos_completed_pair
    check ((status = 'completed') = (completed_at is not null))
);

comment on table public.personal_todos is
  'Kullanicinin yalnizca kendisinin gordugu, projelerden bagimsiz kisisel yapilacaklar. Kimseyle paylasilmaz.';
comment on column public.personal_todos.sort_order is
  'Kolon icindeki manuel siralama. Kucuk deger ustte.';
comment on column public.personal_todos.color is
  'Kullanicinin karta verdigi opsiyonel etiket rengi (#RRGGBB).';

create index if not exists idx_personal_todos_board
  on public.personal_todos (user_id, status, sort_order)
  where archived_at is null;

create index if not exists idx_personal_todos_due
  on public.personal_todos (user_id, due_date)
  where archived_at is null and status <> 'completed';

-- ---------------------------------------------------------------------------
-- 2) Atanan görevlerin kişisel katmanı
-- ---------------------------------------------------------------------------
create table if not exists public.personal_task_prefs (
  user_id           uuid not null references public.users(id) on delete cascade,
  task_id           uuid not null references public.tasks(id) on delete cascade,
  sort_order        integer not null default 0,
  personal_note     text,
  personal_due_date timestamp,
  is_pinned         boolean not null default false,
  is_hidden         boolean not null default false,
  created_at        timestamp not null default current_timestamp,
  updated_at        timestamp not null default current_timestamp,
  primary key (user_id, task_id)
);

comment on table public.personal_task_prefs is
  'Kullaniciya atanan gorevlerin kisisel Yapilacaklar panosundaki yerlesimi. Buradaki not/tarih yalnizca kullaniciya gorunur, projeye yansimaz.';
comment on column public.personal_task_prefs.personal_due_date is
  'Kullanicinin kendine koydugu ic hedef. tasks.deadline degismez.';
comment on column public.personal_task_prefs.is_hidden is
  'Kullanici bu atanan gorevi kendi panosundan gizledi. Gorev projede aynen durur.';

create index if not exists idx_personal_task_prefs_task
  on public.personal_task_prefs (task_id);

-- ---------------------------------------------------------------------------
-- 3) updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := current_timestamp;
  return new;
end;
$$;

drop trigger if exists trg_personal_todos_updated_at on public.personal_todos;
create trigger trg_personal_todos_updated_at
  before update on public.personal_todos
  for each row execute function public.set_updated_at();

drop trigger if exists trg_personal_task_prefs_updated_at on public.personal_task_prefs;
create trigger trg_personal_task_prefs_updated_at
  before update on public.personal_task_prefs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) RLS
--     Projede Supabase Auth kullanilmiyor (kimlik public.users + JWT), bu yuzden
--     tum tablolardaki desen: RLS acik, policy yok -> anon/authenticated tamamen
--     kapali, erisim yalnizca backend'in service_role baglantisindan.
--     Kullanici izolasyonu PersonalTodosService icinde user_id filtreleriyle saglanir.
-- ---------------------------------------------------------------------------
alter table public.personal_todos      enable row level security;
alter table public.personal_task_prefs enable row level security;

revoke all on public.personal_todos      from anon, authenticated;
revoke all on public.personal_task_prefs from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Panonun okuma kaynağı
--     Atanan gorevlerin tasks.sort_order'i PROJE icindeki siradir; kisisel panoda
--     her projeden gelen kartlar 0,1,2... ile carpisip rastgele bir sira olusturur.
--     Bu yuzden kullanicinin HENUZ ELLEMEDIGI atanan gorevler manuel siralama
--     alaninin altina (sentinel 1000000) itilir ve aralarinda aciliyete gore
--     siralanir. Kolonda ilk surukleme yapildigi anda personal_board_move tum
--     kolonu yeniden numaralandirdigi icin sentinel devreden cikar.
-- ---------------------------------------------------------------------------
create or replace view public.v_personal_board
with (security_invoker = on) as

select
  pt.user_id                              as board_user_id,
  pt.id                                   as item_id,
  'personal'::text                        as source,
  pt.title,
  pt.description,
  pt.status,
  pt.priority,
  pt.color,
  pt.due_date                             as effective_due_date,
  null::timestamp                         as project_deadline,
  pt.sort_order,
  false                                   as is_pinned,
  false                                   as is_hidden,
  null::text                              as personal_note,
  null::uuid                              as project_id,
  null::text                              as project_title,
  null::uuid                              as operation_id,
  null::text                              as operation_title,
  null::uuid                              as department_id,
  null::text                              as department_name,
  pt.completed_at,
  pt.created_at,
  pt.updated_at
from public.personal_todos pt
where pt.archived_at is null

union all

select
  t.assigned_to                           as board_user_id,
  t.id                                    as item_id,
  'assigned'::text                        as source,
  t.title,
  t.description,
  t.status,
  'normal'::varchar(10)                   as priority,
  null::varchar(7)                        as color,
  coalesce(ptp.personal_due_date, t.deadline) as effective_due_date,
  t.deadline                              as project_deadline,
  coalesce(ptp.sort_order, 1000000)       as sort_order,
  coalesce(ptp.is_pinned, false)          as is_pinned,
  coalesce(ptp.is_hidden, false)          as is_hidden,
  ptp.personal_note,
  t.project_id,
  p.title::text                           as project_title,
  t.operation_id,
  o.title::text                           as operation_title,
  t.department_id,
  d.name::text                            as department_name,
  t.completed_at,
  t.created_at,
  t.created_at                            as updated_at
from public.tasks t
left join public.personal_task_prefs ptp
       on ptp.task_id = t.id and ptp.user_id = t.assigned_to
left join public.projects   p on p.id = t.project_id
left join public.operations o on o.id = t.operation_id
left join public.departments d on d.id = t.department_id
where t.assigned_to is not null
  and t.archived_at is null
  and t.skipped_at is null;

comment on view public.v_personal_board is
  'Yapilacaklar sayfasinin kanban kaynagi. source=personal (yalniz kullaniciya ait) + source=assigned (atanan gorevler). Sorgular mutlaka board_user_id ile filtrelenmelidir. Siralama: sort_order, sonra effective_due_date.';

revoke all on public.v_personal_board from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6) Sürükle-bırak
--     Durum degisikligi + completed_at tutarliligi + hedef kolonun yeniden
--     numaralandirilmasi TEK statement icinde, TEK snapshot uzerinden yapilir.
--     (Iki ayri sorguyla yapildiginda ikinci sorgu birincinin yazdigini okuyup
--     ayni kolonda mukerrer sort_order olusturuyordu.)
--     Sahiplik kontrolu icerideki user_id filtreleriyle; ihlalde 42501.
-- ---------------------------------------------------------------------------
create or replace function public.personal_board_move(
  p_user_id   uuid,
  p_source    text,      -- 'personal' | 'assigned'
  p_item_id   uuid,
  p_to_status text,      -- 'todo' | 'in_progress' | 'completed'
  p_to_index  integer    -- hedef kolonda 0-tabanli pozisyon
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now     timestamp := current_timestamp;
  v_touched integer;
begin
  if p_to_status not in ('todo','in_progress','completed') then
    raise exception 'Gecersiz kolon: %', p_to_status using errcode = '22023';
  end if;

  if p_source = 'personal' then
    update public.personal_todos
       set status       = p_to_status,
           completed_at = case when p_to_status = 'completed'
                               then coalesce(completed_at, v_now) else null end
     where id = p_item_id and user_id = p_user_id and archived_at is null;
    if not found then
      raise exception 'Kayit bulunamadi veya bu kullaniciya ait degil' using errcode = '42501';
    end if;

  elsif p_source = 'assigned' then
    -- Atanan kartin durumu GERCEK gorev uzerinde degisir (projeye yansir).
    update public.tasks
       set status       = p_to_status,
           completed_at = case when p_to_status = 'completed'
                               then coalesce(completed_at, v_now) else null end,
           completed_by = case when p_to_status = 'completed'
                               then coalesce(completed_by, p_user_id) else null end
     where id = p_item_id and assigned_to = p_user_id and archived_at is null;
    if not found then
      raise exception 'Gorev bulunamadi veya bu kullaniciya atanmamis' using errcode = '42501';
    end if;

    insert into public.personal_task_prefs (user_id, task_id, sort_order)
    values (p_user_id, p_item_id, 0)
    on conflict (user_id, task_id) do nothing;

  else
    raise exception 'Gecersiz source: %', p_source using errcode = '22023';
  end if;

  with col as (
    select source, item_id, sort_order, updated_at,
           (source = p_source and item_id = p_item_id) as is_moved
    from public.v_personal_board
    where board_user_id = p_user_id
      and status = p_to_status
      and is_hidden = false
  ),
  others as (
    select source, item_id,
           row_number() over (order by sort_order, updated_at desc, item_id) - 1 as idx
    from col
    where not is_moved
  ),
  final as (
    select source, item_id,
           case when idx < p_to_index then idx else idx + 1 end as new_order
    from others
    union all
    select p_source, p_item_id,
           least(greatest(p_to_index, 0), (select count(*) from others)::int)
  ),
  upd_personal as (
    update public.personal_todos pt
       set sort_order = f.new_order
      from final f
     where f.source = 'personal' and f.item_id = pt.id and pt.user_id = p_user_id
    returning 1
  ),
  upd_prefs as (
    insert into public.personal_task_prefs (user_id, task_id, sort_order)
    select p_user_id, f.item_id, f.new_order
    from final f
    where f.source = 'assigned'
    on conflict (user_id, task_id)
      do update set sort_order = excluded.sort_order, updated_at = v_now
    returning 1
  )
  select (select count(*) from upd_personal) + (select count(*) from upd_prefs)
    into v_touched;
end;
$$;

comment on function public.personal_board_move is
  'Yapilacaklar panosunda kart tasir: kolonu degistirir, hedef kolonu yeniden siralar. Sahiplik kontrolu icerideki user_id filtreleriyle yapilir.';

revoke all on function public.personal_board_move(uuid, text, uuid, text, integer) from public, anon, authenticated;
