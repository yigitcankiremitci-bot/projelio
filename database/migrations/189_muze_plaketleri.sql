-- 189_muze_plaketleri.sql
--
-- MÜZE: biten her projenin DEĞİŞTİRİLEMEZ plaketi (kullanıcı kararı, 2026-11-10).
--
-- Plaket, projenin bittiği anın fotoğrafıdır: adı, kapağı, ne kadar sürdüğü,
-- teslime göre ne zaman bittiği, kimlerin kaç görevle katkı verdiği. Proje
-- sonradan düzenlenir, yeniden açılır, arşivlenir ya da silinirse plaket
-- OLDUĞU GİBİ kalır. Projenin düzenlenebilir hâli Arşiv > Biten projeler'de.
--
-- NEDEN VERİTABANINDA
--   · Plaketi basan tetikleyici `projects` üzerinde: projeyi "tamamlandı"ya
--     çeviren her yol (proje sayfası, Lio aracı, ileride yazılacak bir yol)
--     kendiliğinden kapsanır; servis kodunda unutulacak bir çağrı yok.
--   · Değişmezliği uygulama değil veritabanı korur: UPDATE ve DELETE
--     tetikleyicide reddedilir, düzenleme ucu da yok.
--
-- TEK İSTİSNA — KVKK: hesabı silinen kişi (users satırı anonimleşir, bkz.
-- account-deletion.service.ts) plakette "Eski ekip üyesi" olur. Bu yazım
-- yalnızca `projelio.muze_anonim` oturum ayarı açıkken ve yalnızca `katkilar`
-- alanında yapılabilir; ayarı yalnızca aşağıdaki users tetikleyicisi açar.
--
-- YABANCI ANAHTAR BİLEREK YOK: proje/iş/şirket silinince plaket gitmesin
-- (müze anıdır, projeye bağlı değildir). `on delete set null` de olmaz, çünkü
-- o da bir UPDATE'tir ve değişmezlik tetikleyicisine takılır.
--
-- Proje başına TEK plaket: yeniden açılıp tekrar kapanan projede ilk plaket kalır.
-- Eğitici örnek işlerin (jobs.is_sample) projelerine plaket basılmaz.
--
-- GERİYE DÖNÜK: bugüne kadar biten projelere bir kez plaket basılır. Bitiş anı
-- kayıtlı olmadığından (projects'te completed_at yok) son biten görevin anı
-- alınır ve plaket `tahmini_tarih = true` olarak işaretlenir.
--
-- IDEMPOTENT: tekrar çalıştırılabilir. Geri alma: database/geri-al/189_muze_plaketleri_geri_al.sql

-- ─────────────────────────────────────────────── 1. Tablo

create table if not exists public.muze_plaketleri (
  id uuid primary key default gen_random_uuid(),
  -- Kaynak proje ve kapsamı (yabancı anahtar YOK, bkz. başlık).
  project_id uuid not null unique,
  job_id uuid,
  organization_id uuid,
  group_id uuid,
  -- Bitiş anındaki kopya.
  proje_adi text not null,
  is_adi text,
  kapak text,
  baslangic date,
  teslim date,
  bitis timestamptz not null,
  -- Bitiş anı tahmin mi (geriye dönük basılan plaketler).
  tahmini_tarih boolean not null default false,
  -- Başlangıçtan bitişe gün (en az 1, iki uç dahil).
  sure_gun integer not null,
  -- Teslim günü − bitiş günü: artı erken, 0 tam gününde, eksi geç. Teslim yoksa boş.
  teslim_farki_gun integer,
  gorev_sayisi integer not null default 0,
  cikti_sayisi integer not null default 0,
  paylasim_sayisi integer not null default 0,
  -- [{ "userId": uuid|null, "ad": text, "gorev": int }] — sıralama YOK, arayüz ada göre dizer.
  katkilar jsonb not null default '[]'::jsonb,
  -- Plaketi görme hakkı olan katılımcılar (bitiş anındaki sahip + üyeler + katkı verenler).
  katilimci_ids uuid[] not null default '{}',
  -- "Bu şirketin/işin N. tamamlanan projesi".
  sira integer,
  sira_kapsami varchar check (sira_kapsami in ('organizasyon', 'is')),
  created_at timestamptz not null default now()
);

create index if not exists muze_plaketleri_job_idx on public.muze_plaketleri (job_id);
create index if not exists muze_plaketleri_org_idx on public.muze_plaketleri (organization_id);
create index if not exists muze_plaketleri_group_idx on public.muze_plaketleri (group_id);
create index if not exists muze_plaketleri_katilimci_idx on public.muze_plaketleri using gin (katilimci_ids);

alter table public.muze_plaketleri enable row level security;

comment on table public.muze_plaketleri is
  'Muze (189): biten projenin degistirilemez plaketi. UPDATE/DELETE tetikleyicide reddedilir; tek istisna KVKK anonimlestirmesi.';

-- ─────────────────────────────────────────────── 2. Değişmezlik

create or replace function public.muze_plaketi_degismez()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and coalesce(current_setting('projelio.muze_anonim', true), '') = '1'
     and (to_jsonb(new) - 'katkilar') = (to_jsonb(old) - 'katkilar') then
    return new;
  end if;
  raise exception 'Muze plaketi degistirilemez (%)', tg_op using errcode = 'P0001';
end;
$$;

drop trigger if exists muze_plaketi_degismez on public.muze_plaketleri;
create trigger muze_plaketi_degismez
  before update or delete on public.muze_plaketleri
  for each row execute function public.muze_plaketi_degismez();

create or replace function public.muze_plaketi_bosaltilamaz()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Muze plaketleri bosaltilamaz' using errcode = 'P0001';
end;
$$;

drop trigger if exists muze_plaketi_bosaltilamaz on public.muze_plaketleri;
create trigger muze_plaketi_bosaltilamaz
  before truncate on public.muze_plaketleri
  for each statement execute function public.muze_plaketi_bosaltilamaz();

-- ─────────────────────────────────────────────── 3. Plaket basma

-- Projenin o anki hâlinden plaket basar. Plaket zaten varsa hiçbir şey yapmaz.
-- p_bitis: bitiş anı; p_tahmini: geriye dönük basımda true.
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
    select title, organization_id, group_id into v_is_adi, v_org, v_grup from jobs where id = p.job_id;
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
    katkilar, katilimci_ids, sira, sira_kapsami
  ) values (
    p_project_id, p.job_id, v_org, v_grup,
    p.title, v_is_adi, p.cover_image_url, p.start_date, p.deadline, p_bitis, p_tahmini,
    greatest(1, v_bitis_gunu - coalesce(p.start_date, v_bitis_gunu) + 1),
    case when p.deadline is null then null else p.deadline - v_bitis_gunu end,
    v_gorev, v_cikti, v_paylasim,
    v_katkilar, v_katilimcilar, v_sira, v_kapsam
  )
  on conflict (project_id) do nothing;
end;
$$;

create or replace function public.muze_proje_bitti()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    -- Plaket basılamazsa proje yine de tamamlanmalı: müze, iş akışını durdurmaz.
    begin
      perform muze_plaket_bas(new.id, now(), false);
    exception when others then
      raise warning 'Muze plaketi basilamadi (proje %): %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists muze_proje_bitti on public.projects;
create trigger muze_proje_bitti
  after insert or update of status on public.projects
  for each row execute function public.muze_proje_bitti();

-- ─────────────────────────────────────────────── 4. KVKK: hesabı silinen kişi

-- account-deletion.service.ts users satırını silmez, anonimleştirir (e-posta
-- silinmis+<id>@projelio.invalid olur). O an kişinin adı plaketlerden kalkar.
create or replace function public.muze_kisi_anonimlesti()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.email like 'silinmis+%@projelio.invalid'
     and old.email is distinct from new.email then
    perform set_config('projelio.muze_anonim', '1', true);
    update muze_plaketleri m
      set katkilar = (
        select coalesce(jsonb_agg(
          case when e->>'userId' = new.id::text
            then jsonb_build_object('userId', null, 'ad', 'Eski ekip üyesi', 'gorev', e->'gorev')
            else e end
        ), '[]'::jsonb)
        from jsonb_array_elements(m.katkilar) e
      )
      where m.katkilar @> jsonb_build_array(jsonb_build_object('userId', new.id::text));
    perform set_config('projelio.muze_anonim', '', true);
  end if;
  return null;
end;
$$;

drop trigger if exists muze_kisi_anonimlesti on public.users;
create trigger muze_kisi_anonimlesti
  after update of email on public.users
  for each row execute function public.muze_kisi_anonimlesti();

-- ─────────────────────────────────────────────── 5. Geriye dönük plaketler

-- Bitiş anı tahmini: son biten görev; görev yoksa teslim günü (geçmişteyse),
-- o da yoksa projenin açılışı. Sıra doğru çıksın diye eskiden yeniye basılır.
do $$
declare
  r record;
begin
  for r in
    select p.id,
      coalesce(
        (select max(t.completed_at) at time zone 'UTC' from tasks t where t.project_id = p.id and t.status = 'completed'),
        case when p.deadline is not null and p.deadline < current_date
          then (p.deadline::timestamp + interval '18 hours') at time zone 'Europe/Istanbul' end,
        p.created_at at time zone 'UTC'
      ) as bitis
    from projects p
    where p.status = 'completed'
      and not exists (select 1 from muze_plaketleri m where m.project_id = p.id)
    order by 2
  loop
    perform muze_plaket_bas(r.id, r.bitis, true);
  end loop;
end $$;

revoke all on public.muze_plaketleri from anon, authenticated;
revoke all on function public.muze_plaket_bas(uuid, timestamptz, boolean) from public, anon, authenticated;
