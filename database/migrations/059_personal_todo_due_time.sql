-- 059_personal_todo_due_time.sql
-- Kişisel görevlerde de bitiş saati ve hatırlatıcı.
--
-- SORUN:
--   Bitiş saati + hatırlatma yalnızca `tasks` tablosuna eklendi (bkz. 057).
--   Yapılacaklar panosunda kişisel kartlar iş görevleriyle yan yana duruyor;
--   birine saat verilebilirken diğerine verilememesi kullanıcı için tutarsız —
--   "aynı pano, aynı kart" beklentisini bozuyor.
--
-- ÇÖZÜM:
--   Aynı üçlü personal_todos'a da eklenir ve görünüm kişisel kolda artık NULL
--   değil gerçek saati döndürür. Kolon adı `due_time`: bu tabloda tarih alanı
--   `due_date`, `deadline` değil — komşusuyla aynı adlandırmayı izliyor.
--
--   Hatırlatma taraması iki tabloyu da okur (bkz. deadline-reminder.processor).

alter table public.personal_todos
  add column if not exists due_time time,
  add column if not exists reminder_lead_minutes integer,
  add column if not exists reminder_sent_at timestamp;

alter table public.personal_todos
  drop constraint if exists personal_todos_reminder_lead_range;
alter table public.personal_todos
  add constraint personal_todos_reminder_lead_range
  check (reminder_lead_minutes is null or (reminder_lead_minutes >= 0 and reminder_lead_minutes <= 10080));

-- tasks'taki kuralın aynısı: saat yoksa "ne kadar önce" sorusunun cevabı yok.
alter table public.personal_todos
  drop constraint if exists personal_todos_reminder_needs_time;
alter table public.personal_todos
  add constraint personal_todos_reminder_needs_time
  check (reminder_lead_minutes is null or due_time is not null);

comment on column public.personal_todos.due_time is
  'Opsiyonel bitis saati. due_date gun, bu kolon saat tutar.';
comment on column public.personal_todos.reminder_lead_minutes is
  'Hatirlatma bitis saatinden kac dakika once gonderilsin. NULL = yok, 0 = tam saatinde.';
comment on column public.personal_todos.reminder_sent_at is
  'Hatirlatma gonderildigi an; tekrar gonderimi engeller.';

create index if not exists idx_personal_todos_pending_reminder
  on public.personal_todos (due_date, due_time)
  where reminder_lead_minutes is not null and reminder_sent_at is null;

-- ---------------------------------------------------------------------------
-- Görünüm: kişisel kol artık gerçek saati döndürür (058'de NULL'dı).
-- ---------------------------------------------------------------------------
drop view if exists public.v_personal_board;

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
  pt.due_time                             as deadline_time,
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
  ta.user_id                              as board_user_id,
  t.id                                    as item_id,
  'assigned'::text                        as source,
  t.title,
  t.description,
  t.status,
  t.priority,
  null::varchar(7)                        as color,
  coalesce(ptp.personal_due_date, t.deadline) as effective_due_date,
  t.deadline_time,
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
from public.task_assignees ta
join public.tasks t on t.id = ta.task_id
left join public.personal_task_prefs ptp
       on ptp.task_id = t.id and ptp.user_id = ta.user_id
left join public.projects    p  on p.id = t.project_id
left join public.jobs        pj on pj.id = p.job_id
left join public.operations  o  on o.id = t.operation_id
left join public.jobs        oj on oj.id = o.job_id
left join public.departments d  on d.id = t.department_id
where t.archived_at is null
  and t.skipped_at is null;

comment on view public.v_personal_board is
  'Yapilacaklar sayfasinin kanban kaynagi. source=personal + source=assigned. Sorgular mutlaka board_user_id ile filtrelenmelidir.';

revoke all on public.v_personal_board from anon, authenticated;
