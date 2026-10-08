-- 152_proje_takvimi.sql
-- Proje takvimi: projenin ORTAK etkinlikleri (toplantı, kilometre taşı,
-- teslim, diğer).
--
-- Kişisel Takvim'in plan bloklarından (plan_time_blocks, 045) bilerek AYRI
-- bir tablo. Plan bloğu kullanıcının kimseye göstermediği kendi zamanıdır;
-- proje etkinliği ise ekibe verilmiş bir sözdür ve projeyi görebilen herkes
-- onu görür. İkisini aynı tabloda tutmak ya planları ekibe açardı ya da
-- etkinlikleri yalnızca yazanına gösterirdi.
--
-- Kişisel Takvim'le bağı okuma yönündedir: etkinlik, katılımcılarının (liste
-- boşsa projenin tüm ekibinin) kişisel takviminde salt okunur olarak görünür
-- (bkz. CalendarService.listMine). Kopyası yazılmaz — kopya olsaydı
-- etkinlik taşındığında kişisel takvimlerde eski saatinde kalırdı.
--
-- Saatler kullanıcının yerel saatidir (plan bloklarıyla aynı model): tarih +
-- HH:MM, saat dilimi taşımaz. Ekip aynı saat dilimindeyken doğru olan budur;
-- farklı dilimlerdeki ekipler için ayrı bir karar gerekecek.
--
-- GÜVENLİK: RLS açık, politika yok — erişim yalnızca CalendarService
-- üzerinden ve her istek AccessService.assertCanViewProject'ten geçer.

create table if not exists public.project_calendar_events (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  created_by       uuid references public.users(id) on delete set null,
  title            varchar(200) not null,
  note             text,
  location         varchar(300),
  kind             varchar(20) not null default 'meeting',
  -- Başlangıç günü. Çok günlü etkinlikte end_date son günü (DAHİL) tutar.
  event_date       date not null,
  end_date         date,
  all_day          boolean not null default false,
  starts_at        time,
  ends_at          time,
  color            varchar(7),
  -- Boş dizi = projenin tüm ekibi. Doluysa etkinlik yalnızca bu kişilerin
  -- (ve yazanın) kişisel takviminde görünür; proje takviminde herkes görür.
  participant_ids  uuid[] not null default '{}',
  created_at       timestamp not null default current_timestamp,
  updated_at       timestamp not null default current_timestamp,

  constraint project_calendar_events_title_not_blank check (length(btrim(title)) > 0),
  constraint project_calendar_events_kind check (kind in ('meeting', 'milestone', 'delivery', 'other')),
  constraint project_calendar_events_color_hex check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint project_calendar_events_end_date check (end_date is null or end_date >= event_date),
  -- Saatli etkinlik tek güne düşer ve iki ucu da dolu olmalı; tüm gün
  -- etkinlikte saat tutulmaz. Kısıt veritabanında: yarım kayıt (başlangıcı
  -- olup bitişi olmayan) ızgarada çizilemeyen bir kutu üretirdi.
  constraint project_calendar_events_times check (
    (all_day and starts_at is null and ends_at is null)
    or (not all_day and starts_at is not null and ends_at is not null and ends_at > starts_at and end_date is null)
  )
);

comment on table public.project_calendar_events is
  'Projenin ortak takvimi. Kişisel plan bloklarından ayrı; katılımcıların kişisel Takvim''inde salt okunur görünür.';

create index if not exists project_calendar_events_project_idx
  on public.project_calendar_events (project_id, event_date);

-- Kişisel takvim "katılımcısı olduğum etkinlikler"i bu dizi üzerinden arar.
create index if not exists project_calendar_events_participants_idx
  on public.project_calendar_events using gin (participant_ids);

alter table public.project_calendar_events enable row level security;
