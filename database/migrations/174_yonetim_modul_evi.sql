-- 174_yonetim_modul_evi.sql
-- Departmanı açılmamış modülün evi Yönetim departmanı (kullanıcı kararı,
-- 2026-11-01; kural packages/shared/src/modulEvi.ts).
--
-- Önce "yönetici (departmansız)" diye ayrı bir yer vardı; modül ekleme
-- penceresinde departmanların yanında görünüp kafa karıştırdı. Artık ev her
-- seferinde hesaplanıyor: ilgili departman açıksa o, değilse Yönetim.
--
-- 1. Her şirketin bir Yönetim'i olsun. Kuraldan muaf (kişi istemez, sayıya
--    girmez) — yeni şirketler artık onunla kuruluyor (OrganizationsService.create),
--    bu satırlar eskiler için. Arşivdeki Yönetim geri getirilir: katalog
--    tekilliği (departments_org_catalog_uniq) ikincisine izin vermez.
-- 2. 173'teki geçiş, bırakılan departmanların organization_modules satırlarını
--    Yönetim'e SABİTLEMİŞTİ. Sabit kalırsa Finans sonradan açıldığında
--    Faturalar'ın kartı Finans'a gider ama yetki Yönetim'de kalırdı. Ev
--    hesaplandığı için bu satırlar boşaltılır (department_id null = olağan
--    durum; yetki katalogdan çözülür, bkz. ModuleMembersService.departmentsWithModule).

update public.departments d
   set archived_at = null
 where d.catalog_key = 'yonetim'
   and d.archived_at is not null
   and not exists (
     select 1 from public.departments x
      where x.organization_id = d.organization_id
        and x.catalog_key = 'yonetim'
        and x.archived_at is null
   );

insert into public.departments (organization_id, catalog_key, name, sort_order)
select o.id, 'yonetim', 'YÖNETİM', -1
  from public.organizations o
 where not exists (
   select 1 from public.departments d
    where d.organization_id = o.id and d.catalog_key = 'yonetim'
 );

update public.organization_modules om
   set department_id = null
  from public.departments d
 where d.id = om.department_id
   and d.catalog_key = 'yonetim';
