-- 146_benzer_hesap_kesfi.sql
-- Sosyal Medya > İlham panosu: "Benzer hesap bul" sonuçları
--
-- Lio kullanıcının nişini çıkarır, AÇIK WEB'de (Anthropic sunucu tarafı web
-- araması) bu nişteki içerik üreticilerini arar ve aday hesapları kaynak
-- bağlantılarıyla döner. Instagram'ın kendisi taranmaz.
--
-- Sonuç SAKLANIR: her keşif hem model kullanımı hem arama başına ücret
-- harcıyor; sayfayı yenileyen kullanıcı aynı listeyi ikinci kez ödememeli.
--
-- GÜVENLİK NOTU: diğer sosyal medya tablolarıyla aynı model — RLS açık,
-- politika yok, erişim yalnızca servis katmanından.

create table if not exists public.social_discoveries (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid references public.organizations(id) on delete cascade,
  job_id             uuid references public.jobs(id) on delete cascade,
  department_id      uuid references public.departments(id) on delete set null,
  -- Keşif tek bir hesabın içeriğine dayanıyorsa o hesap.
  account_id         uuid references public.social_accounts(id) on delete set null,
  istek              text,
  -- { nis, hashtagler, aramalar, adaylar: [...] } — bkz. packages/shared SocialDiscovery.
  icerik             jsonb not null,
  arama_sayisi       integer not null default 0,
  kredi              integer not null default 0,
  created_by         uuid references public.users(id) on delete set null,
  created_at         timestamp not null default (now() at time zone 'utc'),

  constraint social_discoveries_owner check (num_nonnulls(organization_id, job_id) = 1)
);

create index if not exists social_discoveries_org_idx on public.social_discoveries (organization_id, created_at desc);
create index if not exists social_discoveries_job_idx on public.social_discoveries (job_id, created_at desc);

alter table public.social_discoveries enable row level security;
