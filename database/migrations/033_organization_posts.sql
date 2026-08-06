-- 033_organization_posts.sql
-- Şirket/işletme (organizasyon) anasayfasında da bir "Akış" sekmesi olsun:
-- organizasyon geneline doğrudan paylaşım yapılabilsin (bkz. project_posts'un
-- project_id/operation_id/department_id ile polimorfik deseni — aynı desene
-- organization_id ekleniyor, yeni bir tablo açmaya gerek yok). Bu sekmedeki
-- akış ayrıca organizasyona bağlı TÜM departmanların akışlarını da toplu
-- gösterir (bkz. ProjectPostsService.findByOrganization) — o kısım için ayrı
-- bir sütuna gerek yok, department_id zaten departmanın hangi organizasyona
-- bağlı olduğunu departments tablosu üzerinden veriyor.
alter table public.project_posts
  add column organization_id uuid references public.organizations(id) on delete cascade;

alter table public.project_posts
  drop constraint project_posts_single_parent,
  add constraint project_posts_single_parent
    check (num_nonnulls(project_id, operation_id, department_id, organization_id) = 1);

create index project_posts_organization_id_idx
  on public.project_posts(organization_id) where organization_id is not null;
