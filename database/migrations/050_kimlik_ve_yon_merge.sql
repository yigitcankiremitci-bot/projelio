-- 050_kimlik_ve_yon_merge.sql
-- Vizyon + Misyon modüllerinin "Kimlik ve Yön" (A1) altında birleşmesi.
--
-- SORUN:
--   İki ayrı modül, iki ayrı ekran, iki ayrı boş kutu — ama ikisi de tek
--   cümlelik metinler ve birbirine referansla yazılıyor; ayrı yazıldıklarında
--   birbirini tutmuyorlar. Ayrıca liste motoruyla çalıştıkları için her
--   güncelleme yeni bir satır açıyordu: hangisinin yürürlükte olduğu belirsizdi.
--
-- ÇÖZÜM (049 ile birlikte):
--   Her sahip (organizasyon ya da serbest çalışanın işi) için TEK bir
--   kimlik_ve_yon kaydı. En güncel vizyon ve misyon metinleri o kaydın
--   yürürlükteki metnine, daha eski satırlar sürüm arşivine taşınır.
--
-- VERİ KAYBI YOK:
--   Eski satırlar SİLİNMEZ, arşivlenir. Katalog kayıtları da silinmez —
--   silinseydi module_records'a giden foreign key cascade ile eski veriyi de
--   götürürdü. Bunun yerine departman eşlemesinden çıkarılırlar: listelerde
--   görünmezler, veri yerinde durur.
--
-- Alan eşlemesi:
--   vizyon.statement -> vision     misyon.statement -> mission
--   vizyon.horizon   -> horizon    misyon.audience  -> audience
--   *.effectiveDate  -> effectiveFrom   *.status -> status   *.notes -> notes
--
-- Tekrar çalıştırılabilir: her adım "zaten var mı" kontrolü yapar.
--
-- Bkz. docs/moduller/12-modul-kimlik_ve_yon.md ve 20-motor-a1-form.md §7

-- ============================================== 1. Birleşik kayıtların oluşturulması
--
-- "Yürürlükteki" kayıt: önce onaylı olanlar, sonra en yeni (rn = 1).

with src as (
  select
    r.*,
    (r.module_key = 'yonetim_vizyon_sablonu') as is_vision,
    row_number() over (
      partition by coalesce(r.organization_id, r.job_id), r.module_key
      order by (r.data->>'status' = 'approved') desc, r.created_at desc
    ) as rn
  from public.module_records r
  where r.module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu')
    and r.archived_at is null
),
owners as (
  select distinct organization_id, job_id from src
),
v as (select * from src where is_vision and rn = 1),
m as (select * from src where not is_vision and rn = 1),
merged as (
  select
    o.organization_id,
    o.job_id,
    coalesce(v.department_id, m.department_id) as department_id,
    jsonb_strip_nulls(jsonb_build_object(
      'vision',        v.data->>'statement',
      'horizon',       v.data->>'horizon',
      'mission',       m.data->>'statement',
      'audience',      m.data->>'audience',
      'effectiveFrom', coalesce(v.data->>'effectiveDate', m.data->>'effectiveDate'),
      'status',        coalesce(v.data->>'status', m.data->>'status'),
      'notes',         coalesce(v.data->>'notes', m.data->>'notes')
    )) as data,
    least(coalesce(v.created_at, m.created_at), coalesce(m.created_at, v.created_at)) as created_at,
    coalesce(v.created_by, m.created_by) as created_by
  from owners o
  left join v on v.organization_id is not distinct from o.organization_id
              and v.job_id is not distinct from o.job_id
  left join m on m.organization_id is not distinct from o.organization_id
              and m.job_id is not distinct from o.job_id
)
insert into public.module_records
  (organization_id, job_id, department_id, module_key, data, created_by, created_at, updated_at)
select merged.organization_id, merged.job_id, merged.department_id, 'kimlik_ve_yon',
       merged.data, merged.created_by, merged.created_at, current_timestamp
from merged
where not exists (
  select 1 from public.module_records existing
  where existing.module_key = 'kimlik_ve_yon'
    and existing.organization_id is not distinct from merged.organization_id
    and existing.job_id is not distinct from merged.job_id
    and existing.archived_at is null
);

-- ============================================== 2. Eski sürümlerin arşive taşınması
--
-- rn > 1 olan her kayıt o sahibin kimlik_ve_yon kaydının bir geçmiş sürümüdür.
-- Sürüm satırı yalnızca ilgili yarıyı taşır; not alanı hangisi olduğunu söyler.

with src as (
  select
    r.*,
    (r.module_key = 'yonetim_vizyon_sablonu') as is_vision,
    row_number() over (
      partition by coalesce(r.organization_id, r.job_id), r.module_key
      order by (r.data->>'status' = 'approved') desc, r.created_at desc
    ) as rn
  from public.module_records r
  where r.module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu')
    and r.archived_at is null
)
insert into public.module_record_versions (record_id, data, approved_by, approved_at, note)
select
  target.id,
  jsonb_strip_nulls(jsonb_build_object(
    'vision',        case when src.is_vision then src.data->>'statement' end,
    'horizon',       case when src.is_vision then src.data->>'horizon' end,
    'mission',       case when not src.is_vision then src.data->>'statement' end,
    'audience',      case when not src.is_vision then src.data->>'audience' end,
    'effectiveFrom', src.data->>'effectiveDate',
    'status',        src.data->>'status',
    'notes',         src.data->>'notes'
  )),
  src.created_by,
  src.created_at,
  case when src.is_vision then 'Vizyon sürümü (modül birleşmesinden taşındı)'
       else 'Misyon sürümü (modül birleşmesinden taşındı)' end
from src
join public.module_records target
  on target.module_key = 'kimlik_ve_yon'
 and target.organization_id is not distinct from src.organization_id
 and target.job_id is not distinct from src.job_id
 and target.archived_at is null
where src.rn > 1
  and not exists (
    select 1 from public.module_record_versions existing
    where existing.record_id = target.id and existing.approved_at = src.created_at
  );

-- ============================================== 3. Eski kayıtların arşivlenmesi

update public.module_records
set archived_at = current_timestamp
where module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu')
  and archived_at is null;

-- ============================================== 4. Modülün etkinleştirilmesi
--
-- Eski modüllerden biri açık olan her yerde yenisi de açılır; kullanıcı
-- ekranını kaybetmez.

insert into public.organization_modules (organization_id, module_key, enabled_by)
select distinct om.organization_id, 'kimlik_ve_yon', om.enabled_by
from public.organization_modules om
where om.module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu')
on conflict (organization_id, module_key) do nothing;

insert into public.job_modules (job_id, module_key)
select distinct jm.job_id, 'kimlik_ve_yon'
from public.job_modules jm
where jm.module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu')
on conflict (job_id, module_key) do nothing;

-- Modül ekipleri de taşınır: kime atanmışsa yeni modülde de atanmış olsun.
-- Kişi iki eski modülde birden atanmışsa tek satır yazılır (distinct on).
insert into public.module_members
  (organization_id, job_id, department_id, module_key, user_id, invite_email, role, status, assigned_by)
select distinct on (coalesce(mm.organization_id, mm.job_id), coalesce(mm.user_id::text, mm.invite_email))
  mm.organization_id, mm.job_id, mm.department_id, 'kimlik_ve_yon',
  mm.user_id, mm.invite_email, mm.role, mm.status, mm.assigned_by
from public.module_members mm
where mm.module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu')
  and mm.removed_at is null
  and not exists (
    select 1 from public.module_members existing
    where existing.module_key = 'kimlik_ve_yon'
      and existing.organization_id is not distinct from mm.organization_id
      and existing.job_id is not distinct from mm.job_id
      and existing.user_id is not distinct from mm.user_id
      and existing.invite_email is not distinct from mm.invite_email
      and existing.removed_at is null
  )
order by coalesce(mm.organization_id, mm.job_id),
         coalesce(mm.user_id::text, mm.invite_email),
         -- Aynı kişi iki modülde farklı rollerdeyse yüksek yetki korunur.
         (mm.role = 'manager') desc,
         mm.created_at;

-- ============================================== 5. Eski katalog kayıtlarının emekliliği

delete from public.module_catalog_departments
where module_key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu');

update public.module_catalog
set applies_to_freelancer = false,
    description = 'Kimlik ve Yön modülüne taşındı; ayrıca açılması gerekmez.'
where key in ('yonetim_vizyon_sablonu', 'yonetim_misyon_sablonu');

-- ============================================== 6. Tek kayıt kısıtı
--
-- 049'da tanımı bırakılmıştı; veri artık temiz olduğu için burada devreye
-- giriyor. Yalnızca A1 modüllerini kapsar — diğer arketipler çok kayıtlıdır.

create unique index if not exists module_records_single_row_idx
  on public.module_records (
    coalesce(organization_id, job_id),
    module_key,
    coalesce(scope_ref, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where archived_at is null and module_key in ('kimlik_ve_yon', 'pd_urun_stratejileri');
