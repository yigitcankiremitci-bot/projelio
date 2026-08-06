-- 031_department_posts.sql
-- Departman "Akış" sekmesi: Twitter mantığında paylaşım/yorum/beğeni akışı.
-- project_posts zaten 021_operations.sql'de operation_id ile polimorfik hale
-- getirilmişti (project_id/operation_id'den tam olarak biri dolu); aynı deseni
-- department_id ile genişletiyoruz — yeni bir tablo açmaya gerek yok.
alter table public.project_posts
  add column department_id uuid references public.departments(id) on delete cascade;

alter table public.project_posts
  drop constraint project_posts_single_parent,
  add constraint project_posts_single_parent
    check (num_nonnulls(project_id, operation_id, department_id) = 1);

create index project_posts_department_id_idx
  on public.project_posts(department_id) where department_id is not null;
