-- 104_butce_hiyerarsisi.sql
-- Bütçenin tek deftere indirilmesi ve kademeler arası toplanması
--
-- NE VARDI
-- --------
-- Para ÜÇ ayrı yerde duruyordu:
--   1. budget_transactions  — proje / rutin / departman bütçesi (tek para birimi, ₺)
--   2. module_records        — şirketin "Gelir-Gider" modülü (fm_gelir_gider), kayıt
--                              başına para birimli, tamamen ayrı bir yetki kuralıyla
--   3. hiçbiri               — İŞ (job) düzeyinde bütçe kavramı yoktu
--
-- Aynı 10.000 TL'nin hem proje bütçesine hem gelir-gider modülüne girilmesi
-- mümkündü ve yönetim 20.000 TL görürdü. Çift sayımı önlemenin tek sağlam yolu
-- TEK DEFTER tutmaktır (bkz. docs/moduller/02-karar-notu-butce-vs-muhasebe.md —
-- karar 2026-08-09'da alınmış, uygulanması bu migration'a kalmıştı).
--
-- NE DEĞİŞİYOR
-- -----------
-- budget_transactions tüm kademelerin tek defteri oluyor:
--
--   görev (tasks.budget, onaylanınca)
--     └─ proje      budget_transactions.project_id
--         └─ iş     budget_transactions.job_id          ← YENİ
--         └─ departman  budget_transactions.department_id
--             └─ organizasyon  budget_transactions.organization_id  ← YENİ
--                 └─ holding   budget_transactions.group_id         ← YENİ
--
-- Her kademe kendi "harici" gelir/giderini kendi satırına yazar; üst kademe
-- alttakileri TOPLAR, kopyalamaz. Bir satır yalnızca tek bir kademeye aittir
-- (budget_tx_single_parent) — bu yüzden toplama sırasında hiçbir tutar iki kez
-- sayılamaz.
--
-- fm_gelir_gider modülü KALDIRILIYOR: kayıtları buraya taşınıp modül katalogdan
-- siliniyor. Katalog satırına bağlı her şey (organization_modules, job_modules,
-- module_members, module_records) ON DELETE CASCADE ile birlikte düşer — bu
-- yüzden silme işlemi veri taşındıktan SONRA yapılıyor.

-- =============================================================== 1. Tek defter
-- Yeni kademeler. Hepsi CASCADE: kademe silindiğinde defteri de gider —
-- sahipsiz para satırı, toplamlarda görünmeyen ama tabloda duran çöp demektir.
alter table public.budget_transactions
  add column if not exists job_id          uuid references public.jobs(id)          on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists group_id        uuid references public.groups(id)        on delete cascade;

-- Bir satır TEK bir kademeye ait. "<= 1" (= 1 değil) çünkü kişisel Kasa'ya
-- doğrudan girilen kayıtların hiçbir kademesi yoktur; onlar yalnızca owner_id
-- taşır (bkz. 020_budget_ledger_and_recurring.sql).
alter table public.budget_transactions
  drop constraint if exists budget_tx_single_parent;
alter table public.budget_transactions
  add constraint budget_tx_single_parent
    check (num_nonnulls(project_id, operation_id, department_id, job_id, organization_id, group_id) <= 1);

create index if not exists budget_transactions_job_id_idx
  on public.budget_transactions(job_id) where job_id is not null;
create index if not exists budget_transactions_organization_id_idx
  on public.budget_transactions(organization_id) where organization_id is not null;
create index if not exists budget_transactions_group_id_idx
  on public.budget_transactions(group_id) where group_id is not null;

-- ===================================================== 2. Para birimi ve alanlar
--
-- Defter şimdiye kadar TEK PARA BİRİMLİYDİ (arayüz her tutarı ₺ yazıyordu),
-- kaldırılan gelir-gider modülü ise kayıt başına para birimi tutuyordu. Sütun
-- olmadan o kayıtlar taşınamazdı.
--
-- Toplamlar para birimi BAŞINA ayrı hesaplanır, kur dönüşümü YAPILMAZ:
-- "1.000 USD + 1.000 TRY = 2.000 ₺" her zaman yanlıştır ve kur kaynağı
-- olmadan doğrusu da üretilemez (bkz. butce-toplama.ts > paraBirimiBazinda).
alter table public.budget_transactions
  add column if not exists currency varchar(3) not null default 'TRY';

-- Kategori serbest metin: kaldırılan modülde de öyleydi ("Kira", "Yazılım",
-- "Satış"). Hesap planına (referans tablo) çevirmek ayrı bir iş — bkz. karar
-- notu §4. Burada veri kaybetmemek için olduğu gibi taşınıyor.
alter table public.budget_transactions
  add column if not exists category varchar;

-- Karşı taraf: müşteri/tedarikçi kaydı (ortak party varlığı). Gelir-gider
-- modülünde alan olarak yoktu ama alacak-borç modülünde var ve iki defter
-- birleşince aynı soru burada da soruluyor: "bu para kimden geldi / kime gitti".
alter table public.budget_transactions
  add column if not exists counterparty_id uuid references public.party(id) on delete set null;

-- Kaydı KİM girdi. owner_id "hangi deftere ait" sorusunun cevabı (defterin
-- sahibi), created_by ise "kim yazdı" — departman yöneticisinin şirket
-- defterine girdiği kayıtta ikisi farklı kişidir ve denetim için ikisi de lazım.
alter table public.budget_transactions
  add column if not exists created_by uuid references public.users(id) on delete set null;

-- Satır bir GÖREV BÜTÇESİNDEN doğduysa kaynağı. Kademe DEĞİLDİR (görevin
-- projesiyle birlikte durur), bu yüzden single_parent kısıtına girmez.
--
-- Tekil indeks bilerek: aynı görev deftere yalnızca BİR KEZ düşebilir.
-- Olmasaydı "ödendi" düğmesine iki kez basmak aynı gideri iki kez yazardı ve
-- hata ancak ay sonunda, toplamlar tutmayınca fark edilirdi.
alter table public.budget_transactions
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

create unique index if not exists budget_transactions_task_uniq
  on public.budget_transactions(task_id) where task_id is not null;

comment on column public.budget_transactions.currency is
  'ISO 4217 kodu. Toplamlar para birimi basina ayri hesaplanir, kur donusumu yapilmaz.';
comment on column public.budget_transactions.owner_id is
  'Kaydin ait oldugu DEFTERIN sahibi (kisisel Kasa bu sutunla suzuluyor). Kaydi giren kisi icin created_by.';

-- ======================================== 3. Gelir-Gider modülünün taşınması
--
-- fm_gelir_gider kayıtları module_records.data jsonb'sinde duruyor:
--   type (income|expense), amount, currency, category, entryDate, description
--
-- Taşınırken kaydın defter sahibi organizasyonun sahibi olur — departman
-- bütçesindeki kuralın aynısı (bkz. 100_departman_butce_defter_sahibi.sql):
-- defter, paranın sahibinin defteridir.
--
-- Okunamayan tutarlar (boş/sayı olmayan amount) ATLANIR: 0 TL'lik bir satır
-- taşımak, defterde sebebi anlaşılmayan boş kayıtlar bırakırdı. Sayılarını
-- aşağıdaki NOTICE yazıyor.
do $$
declare
  tasinan integer;
  atlanan integer;
begin
  -- Tablo yoksa (ilk kurulum) yapacak bir şey yok.
  if to_regclass('public.module_records') is null then
    raise notice '104: module_records yok, gelir-gider tasima adimi atlandi';
    return;
  end if;

  insert into public.budget_transactions
    (organization_id, owner_id, created_by, type, amount, currency, category, description, occurred_at, created_at)
  select
    mr.organization_id,
    o.owner_id,
    mr.created_by,
    case when mr.data->>'type' = 'expense' then 'expense' else 'income' end,
    (mr.data->>'amount')::numeric,
    coalesce(nullif(mr.data->>'currency', ''), 'TRY'),
    nullif(mr.data->>'category', ''),
    nullif(mr.data->>'description', ''),
    -- entryDate boşsa kaydın oluşturulma günü: tarihsiz satır hiçbir döneme
    -- düşmez ve grafiklerde sessizce kaybolurdu.
    coalesce(nullif(mr.data->>'entryDate', '')::date, mr.created_at::date),
    mr.created_at
  from public.module_records mr
  join public.organizations o on o.id = mr.organization_id
  where mr.module_key = 'fm_gelir_gider'
    and mr.archived_at is null
    and (mr.data->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$'
    and (mr.data->>'amount')::numeric <> 0;
  get diagnostics tasinan = row_count;

  select count(*) into atlanan
  from public.module_records mr
  where mr.module_key = 'fm_gelir_gider'
    and mr.archived_at is null
    and not ((mr.data->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' and (mr.data->>'amount')::numeric <> 0);

  raise notice '104: gelir-gider tasindi=% atlandi(tutarsiz)=%', tasinan, atlanan;
end $$;

-- Katalog satırının silinmesi module_records / organization_modules /
-- job_modules / module_members / partner_module_grants satırlarını CASCADE ile
-- birlikte götürür. Veri yukarıda taşındı; modül artık yok.
delete from public.module_catalog where key = 'fm_gelir_gider';

-- ============================================ 4. Bütçeyi görebilen kullanıcılar
--
-- Bugüne kadar bütçe görünürlüğü her kademede AYRI ve SABİT bir daireydi:
-- projede project_members.can_view_budget, departmanda "organizasyon sahibi +
-- departman yöneticisi", işte hiç yoktu. Yöneticinin "şu kişi de görsün"
-- diyebileceği bir yer yoktu.
--
-- Bu tablo o listeyi tutar. SABİT daireyi (sahip/yönetici) DEĞİŞTİRMEZ, onun
-- ÜZERİNE ekler — yani buradan bir satır silmek sahibi kendi bütçesinden
-- kilitleyemez.
create table if not exists public.budget_viewers (
  id          uuid primary key default gen_random_uuid(),
  scope_type  varchar not null check (scope_type in ('job', 'department', 'organization', 'group')),
  scope_id    uuid not null,
  user_id     uuid not null references public.users(id) on delete cascade,
  -- Yalnızca okuma mu, kayıt da girebilir mi. Onay verme yetkisi BURADAN
  -- GELMEZ: bütçe onayı yöneticinin kararıdır (bkz. butce-erisim.ts).
  can_manage  boolean not null default false,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamp not null default current_timestamp,
  unique (scope_type, scope_id, user_id)
);

-- scope_id'ye FOREIGN KEY KONULAMAZ (dört farklı tabloyu işaret ediyor).
-- Kademe silindiğinde satır öksüz kalır; okuma tarafı zaten önce kademeyi
-- bulduğu için zararsız, ama temizlik gerekirse ölçüt budur.
create index if not exists budget_viewers_scope_idx on public.budget_viewers(scope_type, scope_id);
create index if not exists budget_viewers_user_idx  on public.budget_viewers(user_id);

comment on table public.budget_viewers is
  'Yoneticinin butce gorunurlugu verdigi ek kullanicilar. Sahip/yonetici dairesini degistirmez, uzerine ekler.';

alter table public.budget_viewers enable row level security;

-- ================================================ 5. Görev bütçesi onay akışı
--
-- tasks.budget + tasks.budget_status (pending|planned|paid) zaten vardı ama
-- ONAY DEĞİL, ETİKETTİ: kimin talep ettiği, kimin onayladığı, ne zaman ve
-- neden reddedildiği hiçbir yerde yazmıyordu. "Bütçe onayı proje yöneticisine
-- gider" cümlesinin izlenebilir olması için iz gerekiyor.
alter table public.tasks
  add column if not exists budget_currency     varchar(3) not null default 'TRY',
  add column if not exists budget_requested_by uuid references public.users(id) on delete set null,
  add column if not exists budget_requested_at timestamp,
  add column if not exists budget_decided_by   uuid references public.users(id) on delete set null,
  add column if not exists budget_decided_at   timestamp,
  -- Reddeden yöneticinin gerekçesi; talep eden kişi neyi düzelteceğini bilsin.
  add column if not exists budget_note         text;

-- 'rejected' ekleniyor. Reddedilen talep SİLİNMEZ: talep eden kişi ekranda
-- gerekçeyi görmeli, yoksa "onaylandı mı, unutuldu mu" belirsizliği kalır.
--
-- Kısıt yeniden yazılıyor çünkü repodaki 004 'pending|approved' diyor, canlı
-- veritabanında ise elle 'pending|planned|paid' yapılmış — ikisi de eksik.
alter table public.tasks drop constraint if exists tasks_budget_status_check;
alter table public.tasks
  add constraint tasks_budget_status_check
    check (budget_status in ('pending', 'planned', 'paid', 'rejected'));

create index if not exists tasks_budget_status_idx
  on public.tasks(budget_status) where budget is not null and budget > 0;

-- ===================================== 6. Düzenli gelir/giderler her kademede
--
-- recurring_payments yalnızca owner_id + project_id biliyordu. Kira, maaş,
-- abonelik gibi giderler projeye değil ŞİRKETE ait ve düzenli ödemelerin en
-- yaygın kullanımı tam olarak bunlar (bkz. karar notu, "açık kalan küçük soru").
alter table public.recurring_payments
  add column if not exists department_id   uuid references public.departments(id)   on delete cascade,
  add column if not exists job_id          uuid references public.jobs(id)          on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists group_id        uuid references public.groups(id)        on delete cascade,
  add column if not exists currency        varchar(3) not null default 'TRY',
  add column if not exists category        varchar;

-- Deftere yazılan satırla aynı kural: düzenli ödeme de tek bir kademeye ait.
-- Vadesi gelince üretilen budget_transactions satırı bu kademeyi devralır.
alter table public.recurring_payments
  drop constraint if exists recurring_payments_single_parent;
alter table public.recurring_payments
  add constraint recurring_payments_single_parent
    check (num_nonnulls(project_id, department_id, job_id, organization_id, group_id) <= 1);

create index if not exists recurring_payments_department_idx
  on public.recurring_payments(department_id) where department_id is not null;
create index if not exists recurring_payments_job_idx
  on public.recurring_payments(job_id) where job_id is not null;
create index if not exists recurring_payments_organization_idx
  on public.recurring_payments(organization_id) where organization_id is not null;
create index if not exists recurring_payments_group_idx
  on public.recurring_payments(group_id) where group_id is not null;
