-- 042_module_members.sql
-- Modüle kişi atama ("modül ekibi").
--
-- Eksik olan neydi:
--   Modül sisteminin temel vaadi "her modüle ekipten birileri atanabilir,
--   atanan kişiler o modülde çalışmaya başlar" idi. Ancak bugüne kadar bunun
--   karşılığı olan bir tablo yoktu; module-records.service.ts'teki yetki
--   kontrolü yalnızca (a) organizasyon sahibine ve (b) ilgili departmanın
--   onaylı yöneticisine izin veriyordu. Yani sıradan bir departman çalışanı
--   hiçbir modüle kayıt giremiyordu.
--
-- Ne ekleniyor:
--   1. module_members       — modüle atanan kişi + rolü
--   2. organization_modules.department_id — aynı modül farklı departmanlarda
--      etkinleştirilebilsin (module_records zaten department_id taşıyordu,
--      organization_modules taşımıyordu — bu tutarsızlık gideriliyor)
--
-- Yetkilendirme mimarisiyle tutarlılık: bu projede RLS her tabloda açık ama
-- policy yazılmıyor (yetki tamamen NestJS backend'de, service_role ile).
-- Bu tablo da aynı deseni izliyor.
--
-- Roller department_members ile bilinçli olarak aynı isimlendirmeyi kullanıyor
-- (manager / employee / subcontractor) — kullanıcı iki farklı yerde iki farklı
-- rol sözlüğü öğrenmek zorunda kalmasın.

-- ============================================== 1. Modül ekibi

create table public.module_members (
  id              uuid primary key default gen_random_uuid(),

  -- Sahiplik: module_records ile birebir aynı desen — kayıt ya bir
  -- organizasyona ya bir İŞ'e (serbest çalışan) aittir, ikisi birden değil.
  organization_id uuid references public.organizations(id) on delete cascade,
  job_id          uuid references public.jobs(id) on delete cascade,

  -- Aynı modül birden fazla departmanda etkin olabilir (örn. Müşteri modülü
  -- hem Satış hem Müşteri İlişkileri'nde). Atama hangi departman bağlamında
  -- yapıldıysa burada tutulur. Serbest çalışanda daima boş.
  department_id   uuid references public.departments(id) on delete cascade,

  module_key      varchar not null references public.module_catalog(key) on delete cascade,

  -- Kişi henüz Projelio hesabı açmamışsa user_id boş, invite_email dolu olur
  -- (department_members ile aynı davet deseni).
  user_id         uuid references public.users(id) on delete cascade,
  invite_email    varchar,

  role            varchar not null default 'employee'
                    check (role in ('manager', 'employee', 'subcontractor')),

  status          varchar not null default 'approved'
                    check (status in ('invited', 'pending', 'approved', 'removed')),

  assigned_by     uuid references public.users(id) on delete set null,
  created_at      timestamp not null default current_timestamp,
  removed_at      timestamp,

  -- Kayıt ya organizasyona ya işe ait; ikisi birden ya da ikisi birden boş olamaz.
  constraint module_members_owner_chk check (
    (organization_id is not null and job_id is null)
    or (organization_id is null and job_id is not null)
  ),

  -- Serbest çalışan tarafında departman kavramı yok.
  constraint module_members_job_no_department_chk check (
    job_id is null or department_id is null
  ),

  -- Kişi ya sistemde kayıtlı ya da e-posta ile davet edilmiş olmalı.
  constraint module_members_person_chk check (num_nonnulls(user_id, invite_email) >= 1)
);

comment on table public.module_members is
  'Modul ekibi: bir module atanan kisi + rolu. Atanan kisiler o modulde kayit olusturup duzenleyebilir. user_id bos ise henuz hesap acmamis, davet bekleyen bir atamadir.';
comment on column public.module_members.department_id is
  'Atamanin yapildigi departman baglami. Ayni modul birden fazla departmanda etkinse hangi departman icin atandigini belirtir. Serbest calisanda daima bos.';
comment on column public.module_members.role is
  'manager: modul ayarlarini ve ekibini yonetir. employee: kayit ekler/duzenler. subcontractor: dis kaynak, kayit ekler/duzenler ancak ekibi goremez.';
comment on column public.module_members.status is
  'approved: aktif uye. invited/pending: davet bekliyor. removed: cikarilmis (kayit silinmez, iz kalir).';

-- Aynı kişi aynı modüle aynı departman bağlamında iki kez atanamaz.
-- department_id null olabildiği için coalesce ile sabit bir UUID'ye indirgeniyor
-- (Postgres'te null'lar unique index'te birbirinden farklı sayılır).
create unique index module_members_org_user_uniq
  on public.module_members(
    organization_id,
    module_key,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    user_id
  )
  where organization_id is not null and user_id is not null and removed_at is null;

create unique index module_members_org_email_uniq
  on public.module_members(
    organization_id,
    module_key,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    invite_email
  )
  where organization_id is not null and user_id is null and invite_email is not null and removed_at is null;

create unique index module_members_job_user_uniq
  on public.module_members(job_id, module_key, user_id)
  where job_id is not null and user_id is not null and removed_at is null;

-- Yetki kontrolünün en sık sorgusu: "bu kullanıcı bu modülde üye mi?"
create index module_members_lookup_idx
  on public.module_members(user_id, module_key)
  where user_id is not null and removed_at is null;

-- Modül panelinde ekibi listelemek için.
create index module_members_org_module_idx
  on public.module_members(organization_id, module_key)
  where organization_id is not null and removed_at is null;

create index module_members_job_module_idx
  on public.module_members(job_id, module_key)
  where job_id is not null and removed_at is null;

alter table public.module_members enable row level security;

-- ============================================== 2. Etkin modül departman bağlamı
-- module_records zaten department_id taşıyordu, organization_modules taşımıyordu.
-- Bu yüzden "aynı modülü iki departmanda etkinleştir" senaryosu şemada
-- ifade edilemiyordu. Ekleniyor.

alter table public.organization_modules
  add column if not exists department_id uuid references public.departments(id) on delete cascade;

comment on column public.organization_modules.department_id is
  'Modulun etkinlestirildigi departman. Bos ise organizasyon geneli (kurulum sihirbazindan gelen eski kayitlar boyledir).';

-- DİKKAT: Aşağıdaki iki ifade 044_restore_organization_modules_unique.sql ile
-- GERİ ALINDI. Sebebi: organization-modules.service.ts modül etkinleştirmeyi
-- upsert(..., { onConflict: "organization_id,module_key" }) ile yapıyor ve
-- Postgres'te ON CONFLICT hedefi tam olarak o iki kolonda bir unique index
-- ister — coalesce'lu ifade indeksi bu hedefi karşılamıyor, "Modül ekle"
-- akışı bozuluyor. Çoklu departman tekilliği kod tarafıyla birlikte Faz 3'te
-- gelecek. Migration'lar sıfırdan oynatılırsa 044 bunu düzeltir.

-- Eski (organization_id, module_key) tekilliği artık fazla kısıtlayıcı:
-- aynı modül iki departmanda etkin olabilmeli.
alter table public.organization_modules
  drop constraint if exists organization_modules_organization_id_module_key_key;

create unique index if not exists organization_modules_org_module_dept_uniq
  on public.organization_modules(
    organization_id,
    module_key,
    coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
