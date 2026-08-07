-- 041 — Öncelik: tüm görevlerde 0-5 yıldız
--
--   0 = belirtilmemiş (kartta yıldız dolmaz, varsayılan)
--   1 = en düşük ... 5 = en yüksek
--
-- Öncelik görevin bir özelliği olduğu için tasks tablosunda duruyor: projede kim
-- bakarsa aynı değeri görür, kim değiştirirse herkese yansır.
--
-- Kişisel görevlerdeki metin kademeleri (low/normal/high) aynı ölçeğe taşınıyor
-- ki uygulamada tek bir öncelik dili olsun.

-- personal_todos.priority'nin tipi değişeceği için ona bağlı view önce düşüyor.
drop view if exists public.v_personal_board;

alter table public.tasks
  add column if not exists priority smallint not null default 0;

alter table public.tasks
  drop constraint if exists tasks_priority_range;
alter table public.tasks
  add constraint tasks_priority_range check (priority between 0 and 5);

comment on column public.tasks.priority is
  'Oncelik yildizi 0-5. 0 = belirtilmemis. Gorevin ozelligidir, ekibin tamamina gorunur.';

--   low -> 1, normal -> 0 (varsayılandı, bilinçli bir seçim değildi), high -> 4
alter table public.personal_todos
  drop constraint if exists personal_todos_priority_check;

alter table public.personal_todos
  alter column priority drop default;

alter table public.personal_todos
  alter column priority type smallint
  using case priority
    when 'low'  then 1
    when 'high' then 4
    else 0
  end;

alter table public.personal_todos
  alter column priority set default 0;

alter table public.personal_todos
  add constraint personal_todos_priority_range check (priority between 0 and 5);

comment on column public.personal_todos.priority is
  'Oncelik yildizi 0-5. 0 = belirtilmemis. tasks.priority ile ayni olcek.';

-- View geri kuruluyor; tek fark priority'nin artık iki kolda da smallint olması.
create view public.v_personal_board
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
  pt.updated_at,
  null::text                              as cover_image_url
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
  t.priority,
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
  t.created_at                            as updated_at,
  coalesce(p.cover_image_url, pj.cover_image_url, o.cover_image_url, oj.cover_image_url, d.cover_image_url)::text
                                          as cover_image_url
from public.tasks t
left join public.personal_task_prefs ptp
       on ptp.task_id = t.id and ptp.user_id = t.assigned_to
left join public.projects    p  on p.id = t.project_id
left join public.jobs        pj on pj.id = p.job_id
left join public.operations  o  on o.id = t.operation_id
left join public.jobs        oj on oj.id = o.job_id
left join public.departments d  on d.id = t.department_id
where t.assigned_to is not null
  and t.archived_at is null
  and t.skipped_at is null;

comment on view public.v_personal_board is
  'Yapilacaklar sayfasinin kanban kaynagi. source=personal + source=assigned. Sorgular mutlaka board_user_id ile filtrelenmelidir.';

revoke all on public.v_personal_board from anon, authenticated;
