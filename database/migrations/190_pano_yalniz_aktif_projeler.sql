-- 190 — Yapılacaklar panosu yalnızca AKTİF projelerin görevlerini gösterir.
--
-- SORUN: proje "Beklemede" ya da "Pasif" yapılınca (bkz. 063) görevlerine
-- hiçbir şey olmuyordu — yalnızca arşivleme görevleri de arşivliyor. Durdurulan
-- projenin bitmemiş görevleri Yapılacaklar'da, ana sayfada, 3D ofiste ve
-- takvimin "planlanmamış" tepsisinde "gecikmiş" diye durmaya devam ediyordu.
-- Kullanıcının kararı (2026-11-10): proje dışında YALNIZCA aktif projelerin
-- görevleri dolaşsın; beklemede, pasif ve tamamlanmış projelerinki projenin
-- kendi sayfasında kalsın.
--
-- NEDEN GÖRÜNÜMDE: bu görünüm Yapılacaklar, ana sayfa özetleri, 3D ofis,
-- takvim tepsisi ve Lio'nun pano araçlarının TEK kaynağı. Filtre burada
-- olmazsa her tüketiciye ayrı ayrı yazılır ve biri mutlaka unutulur.
--
-- Görevler SİLİNMEZ, DEĞİŞMEZ: proje yeniden "Aktif" yapıldığı an hepsi
-- panoya geri döner. Projesi olmayan görevler (rutin, departman) etkilenmez.
--
-- Görünüm 068'deki tanımın aynısı; tek fark sondaki proje durumu koşulu.
-- Kolonlar değişmediği için `create or replace` yetiyor.

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
  null::text                              as cover_image_url,
  null::uuid                              as parent_task_id
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
                                          as cover_image_url,
  t.parent_task_id
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
  and t.skipped_at is null
  and (t.project_id is null or p.status = 'active');

comment on view public.v_personal_board is
  'Yapilacaklar sayfasinin kanban kaynagi. source=personal + source=assigned. Yalnizca AKTIF projelerin gorevleri (bkz. 190). Sorgular mutlaka board_user_id ile filtrelenmelidir.';

revoke all on public.v_personal_board from anon, authenticated;
