-- 055_task_multiple_assignees.sql
-- Bir görev birden fazla kişiye atanabilsin.
--
-- SORUN:
--   `tasks.assigned_to` tek bir UUID kolonu. Gerçekte bir işi çoğu zaman iki üç
--   kişi birlikte yürütüyor; bugün ya biri seçilip diğerleri görünmez kalıyor ya
--   da aynı görev kopyalanıp herkese ayrı ayrı açılıyor. Kopyalanan görevler
--   birbirinden bağımsız yaşadığı için biri tamamlandığında diğerleri bayat
--   kalıyor, ilerleme sayıları da şişiyor.
--
-- ÇÖZÜM:
--   Atama, görevin bir KOLONU değil kendi başına bir ilişki: task_assignees.
--   Kolonu çoğaltmak (assigned_to_2, assigned_to_3…) ya da diziye çevirmek
--   ilişkiyi tabloya gömer; "ne zaman, kim tarafından atandı" gibi bilgilere yer
--   kalmaz ve her sorgu dizi açmak zorunda kalır.
--
-- GERİYE DÖNÜK UYUMLULUK:
--   `tasks.assigned_to` KALDIRILMIYOR. Listelerde tek bir yüz göstermek,
--   sıralamak ve mevcut sorguları bozmamak için "birincil atanan" olarak
--   kullanılmaya devam ediyor; sunucu bunu her zaman task_assignees'in ilk
--   üyesiyle eşitler. Böylece bu migration uygulandığı anda çalışan eski sürüm
--   de bozulmaz.

create table if not exists public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- Kimin eklediği: bildirimde "X seni bu göreve ekledi" diyebilmek için.
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamp not null default current_timestamp,
  -- Aynı kişi bir göreve iki kez atanamaz.
  unique (task_id, user_id)
);

create index if not exists idx_task_assignees_task on public.task_assignees(task_id);
create index if not exists idx_task_assignees_user on public.task_assignees(user_id);

-- Depodaki diğer tablolarla aynı kural (bkz. 001_init_schema.sql): RLS açık,
-- POLİTİKA YOK — yani anon/authenticated anahtarlarla tabloya hiç erişilemez.
-- Uygulama sunucusu service_role anahtarı kullandığı için RLS'i baypas eder;
-- yetki kontrolü Nest tarafında (assertProjectAccess / assertDepartmentAccess).
-- Bu satır olmadan tablo dışarıdan okunabilir kalıyordu.
alter table public.task_assignees enable row level security;

comment on table public.task_assignees is
  'Gorev-kisi atamasi (cok kisi). tasks.assigned_to birincil atanandir ve bu tablonun ilk uyesiyle eslesir.';

-- Mevcut tek atamalar taşınır. Idempotent: unique kısıtı sayesinde tekrar
-- çalıştırıldığında yeni satır eklenmez.
insert into public.task_assignees (task_id, user_id, assigned_by)
select t.id, t.assigned_to, t.assigned_to
from public.tasks t
where t.assigned_to is not null
on conflict (task_id, user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Yapılacaklar panosu artık TÜM atananları görür.
--
-- NOT: aşağıdaki `drop view` Supabase editöründe "yıkıcı işlem" uyarısı verir.
-- Görünüm veri TUTMAZ, yalnızca bir sorgu tanımıdır ve hemen ardından yeniden
-- kuruluyor; kolon listesi değiştiği için `create or replace` kullanılamıyor.
-- Tabloya, satıra ya da kullanıcı verisine dokunulmuyor.
--
-- Görünümün "assigned" kolu `t.assigned_to = board_user_id` üzerine kuruluydu:
-- göreve ikinci kişi olarak eklenen biri onu kendi panosunda hiç görmüyordu.
-- Artık kaynak task_assignees; birincil atanan da orada bir satır olduğu için
-- davranış tek atamalı görevlerde birebir aynı kalır.
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
-- Kişisel tercihler (sıra, kişisel tarih/not) atananın KENDİSİNE aittir:
-- aynı görevi iki kişi farklı sırada tutabilir.
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
  'Yapilacaklar sayfasinin kanban kaynagi. source=personal + source=assigned (task_assignees uzerinden, cok atanan destekli). Sorgular mutlaka board_user_id ile filtrelenmelidir.';

revoke all on public.v_personal_board from anon, authenticated;
