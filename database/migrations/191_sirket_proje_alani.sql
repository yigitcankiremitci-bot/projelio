-- 191: Şirket proje alanı + şirket geneli müze plaketleri.
--
-- Kullanıcı kararı (2026-11-10): şirkette "Proje yönetimi" modülü açılınca
-- şirkete ait projeler serbest çalışandaki proje yönetimi gibi çalışmalı;
-- kişisel projelerle karışmamalı ve biten projeleri müzede şirketin BÜTÜN
-- çalışanları görmeli.
--
-- Proje bir işe bağlı yaşıyor (projects.job_id NOT NULL) ve dosya ağacı,
-- bütçe toplaması, yetki, arşiv, Lio araçları hep o bağdan gidiyor. Projeyi
-- doğrudan şirkete bağlamak bunların hepsini ikiye bölerdi. Bunun yerine her
-- şirkete BİR tane işaretli iş açılır: "şirket proje alanı". Şirkete bağlı
-- işin kuralları (şirketi gören işi görür, sahip ve departman yöneticisi tüm
-- projeleri görür, Drive izinleri ve Kasa toplaması şirkete akar) zaten
-- çalışıyor; alan yalnızca arayüzde iş olarak değil, şirketin Projeler
-- sekmesi olarak görünür.
--
-- Müze: plaket değişmez ve iş silinse de kalır; o yüzden "şirket geneli mi"
-- bilgisi okurken jobs'a bakılarak değil, BASILIRKEN plakete yazılır.
-- Şirkete bağlı DİĞER işlerin (ör. taşeron iş talepleri) plaketleri eskisi
-- gibi yalnızca katılımcılara ve yöneticilere açık kalır.
--
-- Bilerek CHECK (sirket_proje_alani → organization_id dolu) YOK: jobs.organization_id
-- yabancı anahtarının silme davranışı repoda yazılı değil; SET NULL ise şirket
-- silinirken kısıt silmeyi kırardı. Şirket silinmeden önce işaret kod tarafında
-- kaldırılıyor (OrganizationsService.remove).
--
-- Sabit varsayılanlı sütun eklemek satır yazmaz: muze_plaketi_degismez UPDATE
-- tetikleyicisi devreye girmez. Geriye dönük doldurma yok — alan yeni.
--
-- IDEMPOTENT. Geri alma: database/geri-al/191_sirket_proje_alani_geri_al.sql

-- ─────────────────────────────────────────────── 1. İşaret

alter table public.jobs
  add column if not exists sirket_proje_alani boolean not null default false;

comment on column public.jobs.sirket_proje_alani is
  'Sirket proje alani (191): sirketin Projeler sekmesinin kabi. Sirket basina bir tane; arayuzde is olarak gorunmez.';

-- Şirket başına tek alan (eşzamanlı iki açılış ikinciyi 23505 ile düşürür).
create unique index if not exists idx_jobs_sirket_proje_alani
  on public.jobs (organization_id) where sirket_proje_alani;

-- ─────────────────────────────────────────────── 2. Müze

alter table public.muze_plaketleri
  add column if not exists sirket_geneli boolean not null default false;

comment on column public.muze_plaketleri.sirket_geneli is
  'Sirket proje alanindan gelen plaket (191): sirketin butun calisanlari gorur.';

create index if not exists muze_plaketleri_sirket_geneli_idx
  on public.muze_plaketleri (organization_id) where sirket_geneli;

-- Basım: 189'daki fonksiyonun aynısı + şirket geneli işareti.
create or replace function public.muze_plaket_bas(p_project_id uuid, p_bitis timestamptz, p_tahmini boolean)
returns void
language plpgsql
set search_path = public
as $$
declare
  p record;
  v_is_adi text;
  v_org uuid;
  v_grup uuid;
  v_sirket_geneli boolean := false;
  v_bitis_gunu date;
  v_katkilar jsonb;
  v_katilimcilar uuid[];
  v_gorev integer;
  v_cikti integer;
  v_paylasim integer;
  v_sira integer;
  v_kapsam varchar;
begin
  if exists (select 1 from muze_plaketleri where project_id = p_project_id) then
    return;
  end if;

  select * into p from projects where id = p_project_id;
  if not found then
    return;
  end if;

  if p.job_id is not null then
    -- Eğitici örnek işin projeleri müzeye girmez: örnek iş silinebilir, plaket silinemez.
    if exists (select 1 from jobs where id = p.job_id and is_sample) then
      return;
    end if;
    select title, organization_id, group_id, coalesce(sirket_proje_alani, false)
      into v_is_adi, v_org, v_grup, v_sirket_geneli
      from jobs where id = p.job_id;
    -- Şirket proje alanının işi bir ad değil, kap: plakette iş adı yazmasın.
    if v_sirket_geneli then
      v_is_adi := null;
    end if;
  end if;

  v_bitis_gunu := (p_bitis at time zone 'Europe/Istanbul')::date;

  -- Biten görevler (arşivlenenler sayılmaz) ve her birinde emeği geçenler:
  -- atananlar (çoklu atama), birincil atanan ve görevi bitiren.
  with biten as (
    select t.id, t.assigned_to, t.completed_by
    from tasks t
    where t.project_id = p_project_id and t.status = 'completed' and t.archived_at is null
  ),
  emek as (
    select b.id as task_id, ta.user_id from biten b join task_assignees ta on ta.task_id = b.id
    union
    select b.id, b.assigned_to from biten b where b.assigned_to is not null
    union
    select b.id, b.completed_by from biten b where b.completed_by is not null
  ),
  sayim as (
    select user_id, count(distinct task_id)::int as gorev from emek group by user_id
  ),
  kisiler as (
    select p.owner_id as user_id where p.owner_id is not null
    union
    select pm.user_id from project_members pm
      where pm.project_id = p_project_id and pm.status = 'approved' and pm.user_id is not null
    union
    select user_id from sayim
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'userId', case when u.email like 'silinmis+%@projelio.invalid' then null else k.user_id end,
      'ad', case when u.email like 'silinmis+%@projelio.invalid' then 'Eski ekip üyesi' else coalesce(u.full_name, 'Ekip üyesi') end,
      'gorev', coalesce(s.gorev, 0)
    )), '[]'::jsonb),
    coalesce(array_agg(k.user_id) filter (where u.email not like 'silinmis+%@projelio.invalid'), '{}')
  into v_katkilar, v_katilimcilar
  from kisiler k
  join users u on u.id = k.user_id
  left join sayim s on s.user_id = k.user_id;

  select count(*)::int into v_gorev from tasks
    where project_id = p_project_id and status = 'completed' and archived_at is null;
  select count(*)::int into v_cikti from outputs
    where project_id = p_project_id and archived_at is null;
  select count(*)::int into v_paylasim from project_posts where project_id = p_project_id;

  -- Sıra: şirket varsa şirketin, yoksa işin kaçıncı biten projesi.
  if v_org is not null then
    v_kapsam := 'organizasyon';
    select count(*)::int + 1 into v_sira from muze_plaketleri
      where organization_id = v_org and bitis <= p_bitis;
  elsif p.job_id is not null then
    v_kapsam := 'is';
    select count(*)::int + 1 into v_sira from muze_plaketleri
      where job_id = p.job_id and bitis <= p_bitis;
  end if;

  insert into muze_plaketleri (
    project_id, job_id, organization_id, group_id,
    proje_adi, is_adi, kapak, baslangic, teslim, bitis, tahmini_tarih,
    sure_gun, teslim_farki_gun, gorev_sayisi, cikti_sayisi, paylasim_sayisi,
    katkilar, katilimci_ids, sira, sira_kapsami, sirket_geneli
  ) values (
    p_project_id, p.job_id, v_org, v_grup,
    p.title, v_is_adi, p.cover_image_url, p.start_date, p.deadline, p_bitis, p_tahmini,
    greatest(1, v_bitis_gunu - coalesce(p.start_date, v_bitis_gunu) + 1),
    case when p.deadline is null then null else p.deadline - v_bitis_gunu end,
    v_gorev, v_cikti, v_paylasim,
    v_katkilar, v_katilimcilar, v_sira, v_kapsam, v_sirket_geneli and v_org is not null
  )
  on conflict (project_id) do nothing;
end;
$$;
