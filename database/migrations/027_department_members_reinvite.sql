-- 027_department_members_reinvite.sql
-- department_members_dept_user_uniq / department_members_dept_email_uniq
-- kadrodan çıkarılmış (status='removed') kayıtları da benzersizlik kısıtına
-- dahil ediyordu; bu yüzden aynı kişi kadrodan çıkarılıp tekrar davet
-- edilmek istendiğinde "Bu kişi zaten bu departmanın kadrosunda" hatası
-- alınıyordu. İndeksler 'removed' durumundaki kayıtları hariç tutacak
-- şekilde yeniden oluşturuluyor.

drop index if exists public.department_members_dept_user_uniq;
create unique index department_members_dept_user_uniq
  on public.department_members(department_id, user_id)
  where user_id is not null and status <> 'removed';

drop index if exists public.department_members_dept_email_uniq;
create unique index department_members_dept_email_uniq
  on public.department_members(department_id, invite_email)
  where user_id is null and invite_email is not null and status <> 'removed';
