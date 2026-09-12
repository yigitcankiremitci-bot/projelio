-- 105_duzenli_araliklar_ve_iliskilendirme.sql
-- Düzenli ödemelere 3/6 aylık aralık + defter kaydının neyle ilgili olduğu
--
-- ÜÇ ŞEY EKLENİYOR
-- ---------------
-- 1. Aralıklar: haftalık / aylık / YENİ 3 aylık / YENİ 6 aylık / yıllık.
--    Vergi, sigorta ve denetim ücretleri gibi kalemler pratikte üç ya da altı
--    ayda bir ödeniyor; kullanıcı bunları ya yıllık girip tutarı bölmek ya da
--    her seferinde elle yazmak zorundaydı.
--
-- 2. `source`: kaydın nereden doğduğu. Üç yol var ve ayırt edilmeleri gerek:
--      manual      — kullanıcı bütçe sayfasından elle girdi
--      task_budget — onaylanan görev bütçesi ödenince üretildi
--      recurring   — düzenli ödemenin vadesi gelince üretildi
--
-- 3. Kaydın bir GÖREVLE ilişkilendirilebilmesi.
--
-- NEDEN `source` OLMADAN 3. MADDE YAPILAMAZDI
-- -------------------------------------------
-- 104'te `budget_transactions.task_id` üzerinde TEKİL indeks vardı: bir görev
-- deftere yalnızca bir kez düşebilsin, "ödendi"ye iki kez basmak gideri iki kez
-- yazmasın diye. Ama artık kullanıcı elle de bir kaydı bir göreve
-- bağlayabiliyor ("bu 3.000 TL, şu görev için alınan malzeme") ve aynı göreve
-- birden fazla masraf yazmak tamamen normal.
--
-- Tekillik bu yüzden `source = 'task_budget'` satırlarına daraltılıyor: asıl
-- korunmak istenen şey ZATEN oydu — otomatik üretilen ödeme satırının
-- tekrarlanmaması. Elle bağlanan kayıtlar serbest.
--
-- KADEME DEĞİŞMİYOR
-- -----------------
-- "İlişkilendirme" ayrı bir sütun DEĞİL: kayıt zaten hangi kademeye aitse
-- oraya yazılıyor (project_id / job_id / department_id / operation_id). Yeni
-- olan şey, kaydı üst bir sayfadan girerken ALT bir kademeyi hedef
-- gösterebilmek. Toplamları bozmaz — alt kademe zaten üste toplanıyor, yani
-- kayıt aşağı indiğinde üstteki rakam değişmez, yalnızca detaylanır.
-- Göreve bağlama ise `task_id` ile: görev bir kademe değil, kademenin içinde
-- yaşayan bir kayıt.

-- ==================================================== 1. Yeni tekrar aralıkları
--
-- Kısıt yeniden yazılıyor (ALTER ... ADD VALUE yok, bu bir enum değil varchar).
alter table public.recurring_payments drop constraint if exists recurring_payments_interval_check;
alter table public.recurring_payments
  add constraint recurring_payments_interval_check
    check (interval in ('weekly', 'monthly', 'quarterly', 'semiannual', 'yearly'));

comment on column public.recurring_payments.interval is
  'weekly | monthly | quarterly (3 ay) | semiannual (6 ay) | yearly. Tarih hesabi: backend/src/modules/budget/vade.ts';

-- Düzenli ödeme de bir görevle ilişkili olabilsin: vadesi gelince üretilen
-- hareket bu bağı devralır. "Şu görev için her ay ödenen danışmanlık" gibi.
alter table public.recurring_payments
  add column if not exists task_id uuid references public.tasks(id) on delete set null;

-- ============================================================== 2. Kaynak alanı
alter table public.budget_transactions
  add column if not exists source varchar not null default 'manual';

-- Geçmiş kayıtlar: kimliğine bakarak doğru kaynağa yerleştiriliyor. Sıra
-- ÖNEMLİ — task_id taşıyan satırların hepsi 104'ün ürettiği ödeme satırları
-- (o sürümde elle bağlama yoktu), recurring_payment_id taşıyanlar cron'un.
update public.budget_transactions set source = 'task_budget' where task_id is not null and source = 'manual';
update public.budget_transactions set source = 'recurring'   where recurring_payment_id is not null and source = 'manual';

alter table public.budget_transactions drop constraint if exists budget_transactions_source_check;
alter table public.budget_transactions
  add constraint budget_transactions_source_check
    check (source in ('manual', 'task_budget', 'recurring'));

comment on column public.budget_transactions.source is
  'Kaydin nereden dogdugu: manual (elle) | task_budget (onaylanan gorev butcesi odenince) | recurring (duzenli odemenin vadesi gelince).';

-- =========================================== 3. Görev bağının tekilliği daralıyor
--
-- Eski indeks: task_id başına TEK satır — elle bağlamayı imkânsız kılıyordu.
-- Yeni indeks: aynı korumayı yalnızca otomatik üretilen ödeme satırına uygular.
drop index if exists budget_transactions_task_uniq;

create unique index if not exists budget_transactions_task_odeme_uniq
  on public.budget_transactions(task_id)
  where task_id is not null and source = 'task_budget';

-- Elle bağlanan kayıtlar için normal indeks: "bu görev için ne harcandı"
-- sorgusu tarama yapmasın.
create index if not exists budget_transactions_task_idx
  on public.budget_transactions(task_id) where task_id is not null;

comment on column public.budget_transactions.task_id is
  'Kaydin ilgili oldugu gorev (alt gorev de olabilir). source=task_budget ise otomatik uretilmis odemedir ve gorev basina TEKTIR; source=manual ise kullanici elle bagladi, ayni goreve birden fazla kayit yazilabilir.';
