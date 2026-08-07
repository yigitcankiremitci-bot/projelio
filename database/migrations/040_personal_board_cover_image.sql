-- 040 — Yapılacaklar kartlarına kapak görseli
--
-- Panodaki kartlara, görevin nereye ait olduğunu bir bakışta gösteren yuvarlak
-- bir görsel ekleniyor. Görev proje/program/departman altında yaşar; en yakın
-- kapsayıcının kapak görseli tercih edilir, proje kendi kapağını koymamışsa
-- bağlı olduğu İŞİN kapağına düşülür.
--
-- Kişisel görevlerin kapsayıcısı yok; orada arayüz kullanıcının kendi profil
-- fotoğrafını gösterir (bkz. TasksOverview), bu yüzden kolon null kalır.
--
-- NOT: create or replace view yalnızca SONA kolon eklemeye izin verir, bu yüzden
-- cover_image_url iki kolun da en sonunda duruyor.

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

revoke all on public.v_personal_board from anon, authenticated;
