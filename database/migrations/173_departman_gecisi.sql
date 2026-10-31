-- 173_departman_gecisi.sql
-- Mevcut şirketlerin yeni departman kuralına bir kerelik geçişi
--
-- NE İÇİN
-- -------
-- Departman artık ilk kişisiyle doğuyor ve 10 kişiden küçük şirkette departman
-- sayısı yönetici dışındaki kişi sayısını geçemiyor (packages/shared/src/
-- departmanKurali.ts). Kural öncesi kurulan şirketlerin çoğunda kimsesi
-- olmayan bir sürü departman var. Her şirket sahibine BİR KEZ bir pencere
-- çıkıyor (apps/web DepartmanGecisiModal): kuralı anlatıyor, hangi
-- departmanları tutacağını soruyor; tutulmayanların verisi YÖNETİM
-- departmanına taşınıp departman SİLİNİYOR (kullanıcı kararı, 2026-11-01).
--
-- Yönetim departmanı kuraldan MUAF: yöneticinin kendi departmanı, kişi
-- istemez, sayıya girmez. Gerekçe: görevler veritabanı kuralı gereği bir
-- departmana ya da projeye ait olmak ZORUNDA (tasks_single_parent), şirket
-- düzeyinde görev yok — taşınacak görevlerin bir evi olmalı.
--
-- NEDEN TEK FONKSİYON
-- -------------------
-- Silme geri alınamaz ve departmana bağlı tabloların çoğu ON DELETE CASCADE:
-- taşınmayı unutulan her satır departmanla birlikte sessizce gider. Taşıma ve
-- silme tek transaction'da: bir adım düşerse hiçbir şey silinmez.
--
-- organizations.departman_gecisi_at: NULL = pencere henüz gösterilmedi /
-- tamamlanmadı. Bu migration'dan SONRA kurulan şirketler kuralla doğduğu
-- için OrganizationsService.create bu alanı hemen doldurur.

alter table public.organizations
  add column if not exists departman_gecisi_at timestamptz;

comment on column public.organizations.departman_gecisi_at is
  'Departman kuralina bir kerelik gecis (bkz. 173). NULL ise sahibine gecis penceresi gosterilir.';

-- p_birakilan: silinecek departmanlar (hepsi p_org'a ait ve arşivlenmemiş olmalı)
-- p_yonetim_adi: Yönetim departmanı yoksa açılacağı ad (sahibin dilinde)
-- Dönüş: Yönetim departmanının kimliği (hiç bırakılan yoksa NULL).
create or replace function public.departman_gecisi_uygula(
  p_org uuid,
  p_birakilan uuid[],
  p_yonetim_adi text,
  p_sahip uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_yonetim uuid;
  v_gecersiz integer;
begin
  -- Aynı şirkete iki geçiş aynı anda koşmasın.
  perform 1 from public.organizations where id = p_org for update;
  if not found then
    raise exception 'Organizasyon bulunamadı';
  end if;

  if coalesce(array_length(p_birakilan, 1), 0) = 0 then
    update public.organizations set departman_gecisi_at = now() where id = p_org;
    return null;
  end if;

  -- Bırakılanlar bu şirketin olmalı; Yönetim bırakılamaz (verinin gideceği yer).
  select count(*) into v_gecersiz
    from unnest(p_birakilan) as b(id)
    left join public.departments d on d.id = b.id
   where d.id is null
      or d.organization_id <> p_org
      or d.archived_at is not null
      or d.catalog_key = 'yonetim';
  if v_gecersiz > 0 then
    raise exception 'Bırakılacak departmanlar geçersiz';
  end if;

  select id into v_yonetim
    from public.departments
   where organization_id = p_org and catalog_key = 'yonetim' and archived_at is null
   limit 1;
  if v_yonetim is null then
    -- Arşivde duran Yönetim varsa geri getirilir (catalog tekilliği ikinciye izin vermez).
    update public.departments set archived_at = null
     where organization_id = p_org and catalog_key = 'yonetim'
     returning id into v_yonetim;
  end if;
  if v_yonetim is null then
    insert into public.departments (organization_id, catalog_key, name, sort_order)
    values (p_org, 'yonetim', p_yonetim_adi, -1)
    returning id into v_yonetim;
  end if;

  -- 1. Kadro: aynı rolleriyle Yönetim'e. Zaten orada olan kişinin satırı
  --    taşınmaz (tekil indeks), bırakılan departmanla birlikte silinir.
  --    Aynı kişi İKİ bırakılan departmandaysa iki satırı birden taşımak
  --    tekil indeksi bozardı: kişi başına tek satır seçilir — onaylı olan,
  --    sonra en yetkili rol (yönetici > çalışan > taşeron).
  update public.department_members m
     set department_id = v_yonetim, reports_to = null
   where m.id in (
     select distinct on (coalesce(x.user_id::text, lower(x.invite_email))) x.id
       from public.department_members x
      where x.department_id = any(p_birakilan)
        and x.status <> 'removed'
        and not exists (
          select 1 from public.department_members y
           where y.department_id = v_yonetim
             and ((x.user_id is not null and y.user_id = x.user_id)
               or (x.user_id is null and y.invite_email = x.invite_email))
        )
      order by coalesce(x.user_id::text, lower(x.invite_email)),
               (x.status = 'approved') desc,
               case x.role when 'manager' then 0 when 'employee' then 1 else 2 end
   );

  -- 2. İş verisi: görevler, çıktılar, bütçe, düzenli ödemeler, akış, ürünler.
  update public.tasks set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.outputs set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.budget_transactions set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.recurring_payments set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.project_posts set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.products set department_id = v_yonetim where department_id = any(p_birakilan);

  -- 3. Dosyalar ve klasörler. Dosyaya erişim satırdaki hesap + bulut
  --    kimliğinden geliyor, departmandan değil: kimlik değişince dosya
  --    kaybolmaz. Buluttaki fiziksel klasör taşıması sunucuda, bu
  --    transaction'dan SONRA denenir (DepartmanGecisiService).
  --    Kökte aynı adlı iki klasör tekil indeksi bozar: çakışan bırakılan
  --    klasör "<ad> (<departman>)" olur.
  --    Kökte aynı adlı iki klasör (Yönetim'de ya da başka bir bırakılan
  --    departmanda) tekil indeksi bozar: çakışan klasör "<ad> (<departman>)" olur.
  update public.file_folders f
     set name = f.name || ' (' || d.name || ')'
    from public.departments d
   where d.id = f.department_id
     and f.department_id = any(p_birakilan)
     and f.kind = 'user'
     and f.parent_folder_id is null
     and exists (
       select 1 from public.file_folders y
        where y.id <> f.id and y.kind = 'user' and y.parent_folder_id is null
          and lower(y.name) = lower(f.name)
          and (y.department_id = v_yonetim
            or (y.department_id = any(p_birakilan) and y.department_id <> f.department_id))
     );
  update public.file_folders set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.files set department_id = v_yonetim where department_id = any(p_birakilan);

  -- 4. Modüller: kayıtlar, açılış satırları, atamalar.
  update public.module_records set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.organization_modules set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.module_members m
     set department_id = v_yonetim
   where m.id in (
     select distinct on (x.organization_id, x.module_key, coalesce(x.user_id::text, lower(x.invite_email))) x.id
       from public.module_members x
      where x.department_id = any(p_birakilan)
        and x.removed_at is null
        and not exists (
          select 1 from public.module_members y
           where y.organization_id = x.organization_id and y.module_key = x.module_key
             and y.department_id = v_yonetim and y.removed_at is null
             and ((x.user_id is not null and y.user_id = x.user_id)
               or (x.user_id is null and y.invite_email = x.invite_email))
        )
      order by x.organization_id, x.module_key, coalesce(x.user_id::text, lower(x.invite_email)),
               case x.role when 'manager' then 0 when 'employee' then 1 else 2 end
   );

  -- 5. Modüllerin kendi tabloları (SET NULL'lar da taşınır: departmansız
  --    kalmaları "yöneticide" demek olurdu, Yönetim varken o ayrımı
  --    taşımaya değmez).
  update public.social_accounts set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.social_posts set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.social_inspirations set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.social_idea_reports set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.social_discoveries set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.social_fb_connections set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.mail_accounts set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.service_accounts set department_id = v_yonetim where department_id = any(p_birakilan);
  update public.service_account_grants g
     set department_id = v_yonetim
   where g.department_id = any(p_birakilan)
     and g.id in (
       select distinct on (x.user_id, x.account_id, x.organization_id, x.job_id) x.id
         from public.service_account_grants x
        where x.department_id = any(p_birakilan)
        order by x.user_id, x.account_id, x.organization_id, x.job_id, (x.revoked_at is null) desc
     )
     and not exists (
       select 1 from public.service_account_grants y
        where y.account_id is null and g.account_id is null
          and y.user_id = g.user_id and y.department_id = v_yonetim
          and coalesce(y.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(g.organization_id, '00000000-0000-0000-0000-000000000000'::uuid)
          and coalesce(y.job_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = coalesce(g.job_id, '00000000-0000-0000-0000-000000000000'::uuid)
     );

  -- 6. Kalanlar (bulut klasör kaydı, klasör izinleri, yükleme oturumları,
  --    çift kadro/atama satırları) departmanla birlikte CASCADE ile gider.
  delete from public.departments where id = any(p_birakilan);

  update public.organizations set departman_gecisi_at = now() where id = p_org;
  return v_yonetim;
end;
$$;

revoke all on function public.departman_gecisi_uygula(uuid, uuid[], text, uuid) from public, anon, authenticated;
