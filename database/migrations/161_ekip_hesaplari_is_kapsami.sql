-- 161_ekip_hesaplari_is_kapsami.sql
-- Ekip Hesapları serbest çalışana da açılıyor.
--
-- 130'da modül yalnızca şirketler içindi: hesap bir departmanın kadrosuna
-- açılıyordu ve ekip_hesaplari.organization_id zorunluydu. Serbest çalışanın
-- şirketi yok ama işi var; ekibine hesap açtığında kişi doğrudan İŞİN
-- ekibine (job_members, onaylı) yazılır — departman ve modül seçimi yok, iş
-- üyesi işin modüllerini zaten görüyor.
--
-- Kayıt ya şirkete ya işe aittir; ikisi birden ya da ikisi birden boş olamaz
-- (module_records'taki 037 deseniyle aynı).

alter table public.ekip_hesaplari alter column organization_id drop not null;

alter table public.ekip_hesaplari
  add column if not exists job_id uuid references public.jobs(id) on delete cascade;

comment on column public.ekip_hesaplari.job_id is
  'Serbest calisanin isi icin acilan hesap. organization_id ile birlikte DEGIL, onun yerine dolar.';

alter table public.ekip_hesaplari drop constraint if exists ekip_hesaplari_sahip_chk;
alter table public.ekip_hesaplari
  add constraint ekip_hesaplari_sahip_chk
    check (
      (organization_id is not null and job_id is null)
      or (organization_id is null and job_id is not null)
    );

create unique index if not exists ekip_hesaplari_job_user_uniq
  on public.ekip_hesaplari(job_id, user_id) where job_id is not null;

create index if not exists ekip_hesaplari_job_idx
  on public.ekip_hesaplari(job_id) where job_id is not null;

update public.module_catalog
set applies_to_freelancer = true
where key = 'ekip_hesaplari';
