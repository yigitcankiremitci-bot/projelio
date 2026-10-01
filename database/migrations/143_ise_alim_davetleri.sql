-- 143_ise_alim_davetleri.sql
-- İşe alım daveti: şirket sahibinin (ya da departman yöneticisinin) Projelio'da
-- ZATEN hesabı olan birini tek formla şirkete alması.
--
-- NE İÇİN
-- -------
-- Şirket sayfasındaki "İşe al" yalnızca İK modülüne bir kayıt açıyordu; kişiyi
-- şirkete katmıyordu. Gerçekten katmanın yolu departman sayfasına gidip kadro
-- daveti göndermek, sonra her modül için ayrı atama yapmaktı — ve kişi her
-- departman davetini ayrı ayrı onaylıyordu. Yönetici bunu bulamadı.
--
-- Burada tek bir davet PAKETİ tutulur: pozisyon, iş tanımı, departmanlar
-- (rolüyle) ve modüller. Kişi kabul edene kadar kadroya/modüle HİÇBİR ŞEY
-- yazılmaz; kabul edince hepsi tek seferde onaylı olarak yazılır. Yarım kabul
-- (iki departmandan biri onaylı, modüller yok) hâli bu yüzden oluşamaz.
--
-- Yetki modeli değişmiyor: kabulden sonra satırlar mevcut department_members
-- ve module_members tablolarına gider. Hesabı olmayanlar için yol hâlâ
-- Ekip Hesapları (migration 130).

create table if not exists public.ise_alim_davetleri (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  invited_by       uuid references public.users(id) on delete set null,
  pozisyon         varchar(120),
  is_tanimi        text,
  -- [{ "departmentId": uuid, "role": "manager" | "employee" | "subcontractor" }]
  departmanlar     jsonb not null default '[]'::jsonb,
  -- [{ "departmentId": uuid, "moduleKey": varchar }]
  moduller         jsonb not null default '[]'::jsonb,
  status           varchar not null default 'pending'
                     check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at       timestamp not null default current_timestamp,
  responded_at     timestamp
);

comment on table public.ise_alim_davetleri is
  'Ise alim daveti paketi: pozisyon + is tanimi + departmanlar + moduller. Kabul edilince department_members ve module_members satirlarina onayli olarak yazilir.';

-- Aynı kişiye aynı şirketten aynı anda tek bekleyen davet: ikincisi ilkini
-- geçersiz kılmalı mı yoksa eklenmeli mi sorusu kişinin önüne gelmesin.
create unique index if not exists ise_alim_davetleri_bekleyen_uniq
  on public.ise_alim_davetleri(organization_id, user_id)
  where status = 'pending';

create index if not exists ise_alim_davetleri_user_idx on public.ise_alim_davetleri(user_id, status);
create index if not exists ise_alim_davetleri_org_idx on public.ise_alim_davetleri(organization_id, created_at desc);

alter table public.ise_alim_davetleri enable row level security;
