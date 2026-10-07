-- 150_plan_etiketleri.sql
-- Takvim: renkli, çoklu etiketler.
--
-- Odak alanlarından (plan_focus_areas) AYRI bir kavram, bilerek. Odak alanı
-- "zamanımı neye bölüyorum" sorusunun cevabıdır: blok başına tektir, dönem
-- hedefleri ve dağılım raporu ona dayanır. Etiket ise serbest bir işarettir
-- ("Acil", "Müşteri A", "Toplantı") ve bir bloğa birden çok takılabilir.
-- İkisini birleştirmek ya raporu bozardı (bir blok iki kovaya sayılırdı) ya
-- da etiketi tekile indirirdi.
--
-- Etiket kalıcı silinir (odak alanı gibi arşivlenmez): geçmiş raporlar
-- etiketlere dayanmıyor, silinen etiketin bloklardaki izi de cascade ile gider.
--
-- GÜVENLİK: 045'teki plan tablolarıyla aynı model — RLS açık, politika yok,
-- erişim yalnızca PlanningService üzerinden ve her sorgu oturumdaki
-- kullanıcının id'siyle filtrelenir. plan_block_labels'ta user_id yok; iki
-- ucun da aynı kullanıcıya ait olduğunu servis yazmadan önce doğrular.

create table if not exists public.plan_labels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        varchar(40) not null,
  color       varchar(7) not null,
  sort_order  integer not null default 0,
  created_at  timestamp not null default current_timestamp,
  updated_at  timestamp not null default current_timestamp,

  constraint plan_labels_name_not_blank check (length(btrim(name)) > 0),
  constraint plan_labels_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.plan_labels is
  'Takvim blokları için kullanıcının renkli etiketleri. Odak alanından ayrı: bir bloğa birden çok etiket takılabilir.';

create unique index if not exists plan_labels_unique_name
  on public.plan_labels (user_id, lower(btrim(name)));

create index if not exists plan_labels_user_idx
  on public.plan_labels (user_id, sort_order);

create table if not exists public.plan_block_labels (
  block_id  uuid not null references public.plan_time_blocks(id) on delete cascade,
  label_id  uuid not null references public.plan_labels(id) on delete cascade,
  primary key (block_id, label_id)
);

-- Etiket silinirken ya da filtrelenirken etiketten bloğa gidiliyor.
create index if not exists plan_block_labels_label_idx
  on public.plan_block_labels (label_id);

alter table public.plan_labels enable row level security;
alter table public.plan_block_labels enable row level security;
