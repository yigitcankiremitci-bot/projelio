-- 045 — Takvim: kişisel planlama katmanı
--
-- Projelio'da bugüne kadar "ne zaman yapılacak" sorusunun tek cevabı görevin
-- teslim tarihiydi. Teslim tarihi bir SON tarihtir; kişinin haftasını nasıl
-- geçireceğini anlatmaz. Takvim sayfası bu boşluğu dolduruyor: kullanıcı
-- dönemlere (gün/hafta/ay) niyet koyuyor, niyeti odak alanlarına yüzdeyle
-- dağıtıyor, dağılımı da somut saat bloklarına indiriyor.
--
-- Zincir tek yönlü ve her halkası opsiyonel:
--
--   plan_focus_areas   "neye vakit ayırıyorum"      (Yazılım, Müzik, İçerik)
--        ↓
--   plan_periods       "bu dönemin niyeti ne"        (gün / hafta / ay)
--        ↓
--   plan_targets       "dönemi nasıl bölüyorum"      (%60 yazılım, 10 içerik)
--        ↓
--   plan_time_blocks   "takvimde nereye düşüyor"     (Salı 09:00-11:30)
--
-- plan_preferences kullanıcının çalışma ritmini (mesai saatleri, iş günleri,
-- günlük hedef) tutar — Lio bir haftayı dağıtırken bu çerçeveyi kullanır.
-- plan_rituals ise Lio'nun hafta başı / gün başı / ay başı sihirbazının
-- kaydıdır: hangi soruların sorulduğu, ne cevaplandığı ve ne karar alındığı.
--
-- GÜVENLİK NOTU
-- -------------
-- personal_todos ile aynı model: Projelio Supabase Auth kullanmadığı için bu
-- tabloların hepsinde RLS açık ama politika yok — erişim yalnızca service_role
-- üzerinden, yani yalnızca ilgili Nest servisinden. Kullanıcı izolasyonu
-- TAMAMEN servis katmanının sorumluluğudur: buradaki her sorgu istisnasız
-- oturumdaki kullanıcının id'siyle filtrelenmek zorundadır ve `userId` asla
-- istek gövdesinden alınmaz, daima `req.user.userId`'den gelir.
--
-- Bu kayıtlar kullanıcının kimseye göstermediği planlarıdır; onları okuyan her
-- yeni kod yolu (rapor, bildirim, dışa aktarma, AI bağlamı) bu gözle ayrıca
-- gözden geçirilmelidir.

-- ---------------------------------------------------------------------------
-- 1) Odak alanları — planlamanın ekseni
-- ---------------------------------------------------------------------------
-- "Yüzde 60 yazılım" cümlesindeki "yazılım". Serbest çalışanın işleri genelde
-- proje sınırlarıyla birebir örtüşmez (üç ayrı müşteri projesi aynı "yazılım"
-- kovasına düşer), bu yüzden odak alanı jobs/projects'ten AYRI bir kavram.
-- İstenirse bir işe bağlanabilir; bağlanmazsa tamamen kullanıcının kendi
-- etiketidir.
create table if not exists public.plan_focus_areas (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  name        varchar(80) not null,
  color       varchar(7),
  -- Opsiyonel bağ: odak alanı bir işe karşılık geliyorsa raporlarda o işin
  -- görevleriyle eşleştirilebilir. İş silinirse alan kalır, bağ kopar.
  job_id      uuid references public.jobs(id) on delete set null,
  sort_order  integer not null default 0,
  archived_at timestamp,
  created_at  timestamp not null default current_timestamp,
  updated_at  timestamp not null default current_timestamp,

  constraint plan_focus_areas_name_not_blank
    check (length(btrim(name)) > 0),
  constraint plan_focus_areas_color_hex
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$')
);

comment on table public.plan_focus_areas is
  'Kullanicinin vaktini bolusturdugu alanlar (Yazilim, Muzik, Icerik). Planlamanin eksenidir; projelerden bagimsizdir. Sadece sahibi gorur.';
comment on column public.plan_focus_areas.job_id is
  'Opsiyonel: odak alani bir ise karsilik geliyorsa raporlamada eslestirilir. Zorunlu degildir.';

-- Aynı kullanıcıda aynı isimde iki aktif alan olmasın; arşivlenmişler serbest.
create unique index if not exists plan_focus_areas_unique_name
  on public.plan_focus_areas (user_id, lower(btrim(name)))
  where archived_at is null;

create index if not exists plan_focus_areas_user_idx
  on public.plan_focus_areas (user_id, sort_order)
  where archived_at is null;

-- ---------------------------------------------------------------------------
-- 2) Dönemler — gün / hafta / ay
-- ---------------------------------------------------------------------------
-- Üç kademe de AYNI tabloda duruyor çünkü hepsinin taşıdığı bilgi aynı: bir
-- başlangıç tarihi, bir niyet cümlesi ve dönem sonunda bir değerlendirme.
-- Ayrı tablolara bölmek üç kez aynı kodu yazdırırdı.
--
-- period_start normalize edilir ve bu tabloya girmeden önce servis katmanında
-- kademeye göre sabitlenir:
--   day   -> günün kendisi
--   week  -> haftanın Pazartesi'si
--   month -> ayın 1'i
-- Böylece (user_id, kind, period_start) doğal bir tekil anahtar olur.
create table if not exists public.plan_periods (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  kind          varchar(6) not null,
  period_start  date not null,

  -- "Bu hafta ağırlığı neye vereceğim" — dönemin tek cümlelik niyeti.
  theme         text,
  note          text,
  -- Dönem sonunda kullanıcının (ya da Lio'nun sorularıyla) yazdığı değerlendirme.
  review_note   text,

  -- Dönem için ayrılan toplam çalışma dakikası. Boşsa plan_preferences'tan
  -- hesaplanır; elle girilirse "bu hafta yarım çalışacağım" gibi istisnalar
  -- planı bozmadan ifade edilebilir.
  capacity_minutes integer,

  status        varchar(8) not null default 'draft',
  created_at    timestamp not null default current_timestamp,
  updated_at    timestamp not null default current_timestamp,
  closed_at     timestamp,

  constraint plan_periods_kind_check
    check (kind in ('day','week','month')),
  constraint plan_periods_status_check
    check (status in ('draft','active','closed')),
  constraint plan_periods_capacity_positive
    check (capacity_minutes is null or capacity_minutes > 0),
  -- 'closed' durumu ile closed_at birbirini zorunlu kilar; ikisi asla ayrismaz.
  constraint plan_periods_closed_pair
    check ((status = 'closed') = (closed_at is not null))
);

comment on table public.plan_periods is
  'Kullanicinin gun/hafta/ay donemleri: donemin niyeti, kapasitesi ve donem sonu degerlendirmesi. Sorgular mutlaka user_id ile filtrelenmelidir.';
comment on column public.plan_periods.period_start is
  'Kademeye gore normalize edilmis baslangic: day=gun, week=pazartesi, month=ayin 1i. Servis katmani normalize eder.';
comment on column public.plan_periods.capacity_minutes is
  'Donem icin ayrilan toplam calisma dakikasi. Bos ise plan_preferences uzerinden hesaplanir.';

create unique index if not exists plan_periods_unique
  on public.plan_periods (user_id, kind, period_start);

create index if not exists plan_periods_lookup_idx
  on public.plan_periods (user_id, kind, period_start desc);

-- ---------------------------------------------------------------------------
-- 3) Hedefler — dönemin nasıl bölüneceği
-- ---------------------------------------------------------------------------
-- İki farklı hedef dili aynı satırda yaşar, çünkü kullanıcı ikisini bir arada
-- kurar: "%60 yazılım, %30 müzik, ayrıca 10 içerik".
--   share_pct     -> zaman payı  (yüzde)
--   target_count  -> adet hedefi (10 içerik)
-- İkisi birlikte de kullanılabilir; en az biri dolu olmalıdır.
--
-- Yüzdelerin toplamının 100 olması ZORUNLU DEĞİL — kasıtlı. Kullanıcı %90
-- dağıtıp gerisini boş bırakabilir; kalan pay "esneklik payı"dır. Toplam 100'ü
-- aşarsa bu bir veri hatası değil planlama hatasıdır, arayüzde uyarı olarak
-- gösterilir (bkz. v_plan_period_progress.share_pct_total).
create table if not exists public.plan_targets (
  id             uuid primary key default gen_random_uuid(),
  period_id      uuid not null references public.plan_periods(id) on delete cascade,
  focus_area_id  uuid references public.plan_focus_areas(id) on delete cascade,

  -- Odak alanına bağlı olmayan serbest hedefler için ("portfolyo sitesini bitir").
  title          varchar(160),

  share_pct      numeric(5,2),
  target_minutes integer,
  target_count   integer,
  -- Adet hedefinin birimi: "icerik", "video", "sarki".
  unit           varchar(24),
  -- Elle ilerletilen sayaç. Zaman hedefleri bloklardan hesaplanir, adet
  -- hedeflerinin otomatik bir kaynagi yok.
  done_count     integer not null default 0,

  sort_order     integer not null default 0,
  created_at     timestamp not null default current_timestamp,
  updated_at     timestamp not null default current_timestamp,

  constraint plan_targets_share_range
    check (share_pct is null or (share_pct >= 0 and share_pct <= 100)),
  constraint plan_targets_minutes_positive
    check (target_minutes is null or target_minutes > 0),
  constraint plan_targets_count_positive
    check (target_count is null or target_count >= 0),
  constraint plan_targets_done_count_positive
    check (done_count >= 0),
  -- Hedefin bir sahibi olmali: ya bir odak alani ya da serbest bir baslik.
  constraint plan_targets_owner_chk
    check (focus_area_id is not null or length(btrim(coalesce(title,''))) > 0),
  -- Bos hedef satiri anlamsiz: en az bir olcut girilmeli.
  constraint plan_targets_measure_chk
    check (share_pct is not null or target_minutes is not null or target_count is not null)
);

comment on table public.plan_targets is
  'Bir donemin odak alanlarina dagilimi. share_pct zaman payi, target_count adet hedefi. Yuzdelerin toplami 100 olmak zorunda degildir.';
comment on column public.plan_targets.done_count is
  'Adet hedefleri icin elle ilerletilen sayac. Zaman hedefleri plan_time_blocks uzerinden hesaplanir.';

-- Bir dönemde aynı odak alanı iki kez hedeflenemez.
create unique index if not exists plan_targets_unique_area
  on public.plan_targets (period_id, focus_area_id)
  where focus_area_id is not null;

create index if not exists plan_targets_period_idx
  on public.plan_targets (period_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4) Zaman blokları — takvimin kendisi
-- ---------------------------------------------------------------------------
-- Takvimde görünen somut kutular. Bir blok üç şeyden birine bağlanabilir:
--   focus_area_id     sadece kategori    ("Yazılım — derin çalışma")
--   task_id           gerçek bir görev   (projeye/ekibe yansıyan iş)
--   personal_todo_id  kişisel bir görev
-- Görev bağı en fazla bir tane olabilir; odak alanı her durumda ayrıca
-- verilebilir (görev hangi kovaya sayılacaksa).
--
-- Blok görevin KENDİSİ DEĞİL, ona ayrılan zamandır: bir görev birden çok bloğa
-- bölünebilir, blok silinince görev durur. Bu ayrım bilinçli — aksi halde
-- takvimden bir kutu silmek projedeki işi silerdi.
create table if not exists public.plan_time_blocks (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,

  block_date       date not null,
  starts_at        time not null,
  ends_at          time not null,

  title            varchar(160),
  note             text,
  color            varchar(7),

  focus_area_id    uuid references public.plan_focus_areas(id) on delete set null,
  task_id          uuid references public.tasks(id) on delete cascade,
  personal_todo_id uuid references public.personal_todos(id) on delete cascade,

  -- Blogu kim koydu: kullanici mi, Lio mu, yoksa bir programin rutininden mi
  -- turedi. Lio'nun onerdigi bloklarin ayirt edilmesi, "onerileri temizle"
  -- gibi toplu islemler icin gerekli.
  source           varchar(8) not null default 'manual',
  status           varchar(8) not null default 'planned',
  -- Gerceklesen sure. Bos ise blogun planlanan suresi gerceklesmis sayilir.
  actual_minutes   integer,
  completed_at     timestamp,

  sort_order       integer not null default 0,
  created_at       timestamp not null default current_timestamp,
  updated_at       timestamp not null default current_timestamp,

  constraint plan_time_blocks_source_check
    check (source in ('manual','lio','routine')),
  constraint plan_time_blocks_status_check
    check (status in ('planned','done','skipped')),
  constraint plan_time_blocks_time_order
    check (ends_at > starts_at),
  constraint plan_time_blocks_color_hex
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint plan_time_blocks_actual_positive
    check (actual_minutes is null or actual_minutes >= 0),
  -- Bir blok en fazla bir karta baglanir.
  constraint plan_time_blocks_single_link
    check (task_id is null or personal_todo_id is null),
  -- Bloğun bir kimliği olmalı: ya başlık, ya odak alanı, ya bir kart.
  constraint plan_time_blocks_identity_chk
    check (
      length(btrim(coalesce(title,''))) > 0
      or focus_area_id is not null
      or task_id is not null
      or personal_todo_id is not null
    ),
  -- 'done' durumu ile completed_at birbirini zorunlu kilar.
  constraint plan_time_blocks_completed_pair
    check ((status = 'done') = (completed_at is not null))
);

comment on table public.plan_time_blocks is
  'Takvimdeki somut zaman kutulari. Goreve baglanabilir ama gorevin kendisi degildir: blok silinince gorev durur. Sorgular mutlaka user_id ile filtrelenmelidir.';
comment on column public.plan_time_blocks.source is
  'manual = kullanici koydu, lio = AI onerdi, routine = program rutininden turedi.';
comment on column public.plan_time_blocks.actual_minutes is
  'Gerceklesen sure. Bos ise blogun planlanan suresi gerceklesmis kabul edilir.';

create index if not exists plan_time_blocks_day_idx
  on public.plan_time_blocks (user_id, block_date, starts_at);

create index if not exists plan_time_blocks_focus_idx
  on public.plan_time_blocks (user_id, focus_area_id, block_date);

create index if not exists plan_time_blocks_task_idx
  on public.plan_time_blocks (task_id)
  where task_id is not null;

-- ---------------------------------------------------------------------------
-- 5) Çalışma ritmi tercihleri
-- ---------------------------------------------------------------------------
-- Lio bir haftayı dağıtırken "kaç saatlik bir haftadan bahsediyoruz" sorusuna
-- cevap ister. Varsayılanlar tipik bir serbest çalışan haftasıdır; kullanıcı
-- ayarlar ekranından değiştirir.
create table if not exists public.plan_preferences (
  user_id               uuid primary key references public.users(id) on delete cascade,
  timezone              varchar(64) not null default 'Europe/Istanbul',

  -- 0 = Pazar ... 6 = Cumartesi (JS getDay() ile ayni olcek).
  workdays              smallint[] not null default '{1,2,3,4,5}',
  day_start             time not null default '09:00',
  day_end               time not null default '18:00',
  daily_target_minutes  integer not null default 360,
  -- Lio'nun onerecegi tipik blok uzunlugu ve aralardaki bosluk.
  focus_block_minutes   integer not null default 90,
  break_minutes         integer not null default 15,

  -- Ritueller: hafta basi / gun basi / ay basi sihirbazlarinin zamanlamasi.
  rituals_enabled       boolean not null default true,
  weekly_ritual_weekday smallint not null default 1,
  weekly_ritual_time    time not null default '09:00',
  daily_ritual_time     time not null default '09:00',
  monthly_ritual_day    smallint not null default 1,

  created_at            timestamp not null default current_timestamp,
  updated_at            timestamp not null default current_timestamp,

  constraint plan_preferences_day_order
    check (day_end > day_start),
  constraint plan_preferences_daily_target
    check (daily_target_minutes between 30 and 1440),
  constraint plan_preferences_focus_block
    check (focus_block_minutes between 15 and 480),
  constraint plan_preferences_break
    check (break_minutes between 0 and 240),
  constraint plan_preferences_weekly_weekday
    check (weekly_ritual_weekday between 0 and 6),
  constraint plan_preferences_monthly_day
    check (monthly_ritual_day between 1 and 28)
);

comment on table public.plan_preferences is
  'Kullanicinin calisma ritmi: mesai saatleri, is gunleri, gunluk hedef ve ritual zamanlamasi. Lio dagitim yaparken bu cerceveyi kullanir.';
comment on column public.plan_preferences.workdays is
  'Calisilan gunler. 0 = Pazar ... 6 = Cumartesi (JS getDay() ile ayni olcek).';
comment on column public.plan_preferences.monthly_ritual_day is
  'Ayin kacinci gunu aylik ritual sorulur. 28 ile sinirli: her ayda karsiligi olsun diye.';

-- ---------------------------------------------------------------------------
-- 6) Ritüeller — Lio sihirbazının kaydı
-- ---------------------------------------------------------------------------
-- Hafta başı / gün başı / ay başı oturumları. Kayıt iki işe yarar:
--   1. Aynı ritüel aynı gün iki kez sorulmaz (unique index).
--   2. Lio bir sonraki oturumda "geçen hafta şuna ağırlık vereceğini
--      söylemiştin, ne oldu?" diye sorabilir.
--
-- Ritüelin "zamanı geldi mi" sorusu bu tabloda TUTULMAZ, hesaplanır: bugünün
-- tarihi + plan_preferences yeterli. Böylece hiçbir zamanlanmış görev (cron)
-- olmadan da sihirbaz doğru günde karşılar.
create table if not exists public.plan_rituals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  kind         varchar(7) not null,
  occurred_on  date not null,
  -- Ritualin urettigi/guncelledigi donem. Donem silinirse kayit da gider.
  period_id    uuid references public.plan_periods(id) on delete cascade,

  status       varchar(9) not null default 'pending',
  -- Sihirbazin soru-cevap dokumu. Sema kasitli olarak serbest: sorular
  -- surumden surume degisecek, eski kayitlar okunabilir kalmali.
  answers      jsonb not null default '{}'::jsonb,
  -- Lio'nun oturumdan cikardigi ozet; bir sonraki oturumun girdisi olur.
  summary      text,

  created_at   timestamp not null default current_timestamp,
  completed_at timestamp,

  constraint plan_rituals_kind_check
    check (kind in ('daily','weekly','monthly')),
  constraint plan_rituals_status_check
    check (status in ('pending','done','skipped')),
  constraint plan_rituals_answers_object
    check (jsonb_typeof(answers) = 'object'),
  -- Biten bir oturum (done/skipped) mutlaka bitis zamani tasir.
  constraint plan_rituals_completed_pair
    check ((status <> 'pending') = (completed_at is not null))
);

comment on table public.plan_rituals is
  'Lio planlama sihirbazinin oturum kaydi. Ayni ritual ayni gun iki kez sorulmaz; bir sonraki oturum onceki summary uzerine konusur.';
comment on column public.plan_rituals.answers is
  'Sihirbaz soru-cevaplari. Sema serbest: sorular surumden surume degisir, eski kayitlar okunabilir kalmali.';

create unique index if not exists plan_rituals_unique
  on public.plan_rituals (user_id, kind, occurred_on);

create index if not exists plan_rituals_recent_idx
  on public.plan_rituals (user_id, kind, occurred_on desc);

-- ---------------------------------------------------------------------------
-- 7) RLS — erişim yalnızca service_role ile
-- ---------------------------------------------------------------------------
alter table public.plan_focus_areas  enable row level security;
alter table public.plan_periods      enable row level security;
alter table public.plan_targets      enable row level security;
alter table public.plan_time_blocks  enable row level security;
alter table public.plan_preferences  enable row level security;
alter table public.plan_rituals      enable row level security;

revoke all on public.plan_focus_areas  from anon, authenticated;
revoke all on public.plan_periods      from anon, authenticated;
revoke all on public.plan_targets      from anon, authenticated;
revoke all on public.plan_time_blocks  from anon, authenticated;
revoke all on public.plan_preferences  from anon, authenticated;
revoke all on public.plan_rituals      from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8) İlerleme görünümü — hedef ile gerçeğin karşılaştırması
-- ---------------------------------------------------------------------------
-- Takvimin "haftayı verimli kullanma yüzdeleri" ekranının tek kaynağı.
-- Her satır bir dönem × odak alanı: ne hedeflendi, ne planlandı, ne yapıldı.
--
-- Hedefi olup hiç bloğu olmayan alanlar da (henüz takvime düşmemiş hedef),
-- bloğu olup hedefi olmayan alanlar da (plan dışı çalışma) görünür — ikisi de
-- kullanıcının görmesi gereken sapmalardır. Bu yüzden birleşim FULL JOIN.
drop view if exists public.v_plan_period_progress;

create view public.v_plan_period_progress
with (security_invoker = on) as

with span as (
  select
    p.id           as period_id,
    p.user_id,
    p.kind,
    p.period_start,
    p.period_start as from_date,
    case p.kind
      when 'day'  then p.period_start
      when 'week' then p.period_start + 6
      else (p.period_start + interval '1 month')::date - 1
    end            as to_date
  from public.plan_periods p
),

-- Dönemin tarih aralığına düşen blokların odak alanı bazında toplamı.
block_rollup as (
  select
    s.period_id,
    b.focus_area_id,
    sum(
      (extract(epoch from (b.ends_at - b.starts_at)) / 60)::int
    ) filter (where b.status <> 'skipped')                       as planned_minutes,
    sum(
      coalesce(
        b.actual_minutes,
        (extract(epoch from (b.ends_at - b.starts_at)) / 60)::int
      )
    ) filter (where b.status = 'done')                           as done_minutes,
    count(*) filter (where b.status <> 'skipped')                as block_count,
    count(*) filter (where b.status = 'done')                    as done_block_count
  from span s
  join public.plan_time_blocks b
    on b.user_id = s.user_id
   and b.block_date between s.from_date and s.to_date
  group by s.period_id, b.focus_area_id
),

-- Hedefler ve bloklar aynı eksende birleşir. İki taraftan biri boş olabilir.
merged as (
  select
    coalesce(t.period_id, r.period_id)         as period_id,
    coalesce(t.focus_area_id, r.focus_area_id) as focus_area_id,
    t.id                                       as target_id,
    t.title                                    as target_title,
    t.share_pct,
    t.target_minutes,
    t.target_count,
    t.unit,
    t.done_count,
    t.sort_order,
    coalesce(r.planned_minutes, 0)             as planned_minutes,
    coalesce(r.done_minutes, 0)                as done_minutes,
    coalesce(r.block_count, 0)                 as block_count,
    coalesce(r.done_block_count, 0)            as done_block_count
  from public.plan_targets t
  full join block_rollup r
    on r.period_id = t.period_id
   -- Kasıtlı olarak DÜZ eşitlik: null = null eşleşmez.
   --
   -- Odak alanı olmayan serbest hedefler ("portfolyo sitesini bitir") ile
   -- odak alanı seçilmemiş bloklar aynı satıra düşmemeli. `is not distinct
   -- from` kullanılsaydı, bir dönemdeki HER serbest hedef kategorisiz
   -- blokların toplam süresini kendine yazar ve aynı dakikalar birden çok
   -- kez sayılırdı. Şimdi kategorisiz bloklar kendi başına bir satır olarak
   -- (focus_area_id ve target_id null) görünüyor — "plan dışı çalışma" olarak
   -- okunması gereken şey de tam olarak budur.
   and r.focus_area_id = t.focus_area_id
)

select
  s.period_id,
  s.user_id,
  s.kind,
  s.period_start,
  s.from_date,
  s.to_date,

  m.target_id,
  m.focus_area_id,
  fa.name                                      as focus_area_name,
  fa.color                                     as focus_area_color,
  m.target_title,

  m.share_pct,
  m.target_minutes,
  m.target_count,
  m.unit,
  m.done_count,
  m.sort_order,

  m.planned_minutes,
  m.done_minutes,
  m.block_count,
  m.done_block_count,

  -- Dönem geneli — her satırda tekrarlanır ki arayüz tek sorguyla hem satırı
  -- hem yüzdenin paydasını görsün.
  sum(m.planned_minutes) over (partition by s.period_id) as period_planned_minutes,
  sum(m.done_minutes)    over (partition by s.period_id) as period_done_minutes,
  sum(m.share_pct)       over (partition by s.period_id) as share_pct_total,

  -- Gerçekleşen pay: bu alan, dönemde PLANLANAN zamanın yüzde kaçını aldı.
  case
    when sum(m.planned_minutes) over (partition by s.period_id) > 0
    then round(
      100.0 * m.planned_minutes
        / sum(m.planned_minutes) over (partition by s.period_id),
      2
    )
  end as planned_share_pct,

  -- Gerçekleşen pay: bu alan, dönemde YAPILAN zamanın yüzde kaçını aldı.
  case
    when sum(m.done_minutes) over (partition by s.period_id) > 0
    then round(
      100.0 * m.done_minutes
        / sum(m.done_minutes) over (partition by s.period_id),
      2
    )
  end as done_share_pct

from span s
join merged m on m.period_id = s.period_id
left join public.plan_focus_areas fa on fa.id = m.focus_area_id;

comment on view public.v_plan_period_progress is
  'Donem x odak alani: hedeflenen pay, takvime dusen sure ve gerceklesen sure. Takvimin verimlilik yuzdelerinin tek kaynagi. Sorgular mutlaka user_id ile filtrelenmelidir.';

revoke all on public.v_plan_period_progress from anon, authenticated;
