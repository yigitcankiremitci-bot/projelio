-- 057_task_deadline_time_and_reminder.sql
-- Göreve opsiyonel bitiş saati ve o saate bağlı hatırlatıcı.
--
-- SORUN:
--   `tasks.deadline` gün hassasiyetinde kullanılıyor (arayüzde tarih girişi,
--   sunucuda gün olarak karşılaştırma). "Bugün 17:00'de teslim" gibi bir iş
--   yazılamıyor; kullanıcı saati başlığa ya da açıklamaya elle yazıyor ve
--   hiçbir yerde hatırlatma kurulamıyor.
--
-- ÇÖZÜM:
--   Saat ayrı bir kolonda (`deadline_time`), opsiyonel. `deadline`ın kendisini
--   saatli hale getirmedik: o alan bugün her yerde gün olarak okunuyor
--   (takvim, gecikme hesabı, özet bildirimleri) ve tipini değiştirmek bu
--   sorguların hepsini sessizce kaydırırdı. Saat AYRI bir bilgi olarak durur,
--   isteyen birleştirip kullanır.
--
--   Hatırlatma ön süresi göreve özel (`reminder_lead_minutes`): kısa bir iş için
--   "tam saatinde", uzun bir hazırlık için "1 gün önce" anlamlı olabiliyor.
--   NULL = hatırlatma yok. 0 = tam saatinde.
--
--   `reminder_sent_at`, hatırlatmanın gönderildiği an. Zamanlanmış iş her
--   çalıştığında aynı görevi tekrar bildirmesin diye tek başına yeterli:
--   ayrı bir "gönderildi mi" tablosu tutmaya gerek yok. Saat ya da ön süre
--   değişirse sunucu bu alanı sıfırlar, hatırlatma yeniden kurulmuş olur.

alter table public.tasks
  add column if not exists deadline_time time,
  add column if not exists reminder_lead_minutes integer,
  add column if not exists reminder_sent_at timestamp;

alter table public.tasks
  drop constraint if exists tasks_reminder_lead_range;
alter table public.tasks
  add constraint tasks_reminder_lead_range
  check (reminder_lead_minutes is null or (reminder_lead_minutes >= 0 and reminder_lead_minutes <= 10080));

-- Hatırlatma yalnızca saat girilmişse anlamlı: saat yoksa "ne zamandan önce"
-- sorusunun cevabı yok. Veriyi tutarlı tutar, arayüzdeki kuralla aynı.
alter table public.tasks
  drop constraint if exists tasks_reminder_needs_time;
alter table public.tasks
  add constraint tasks_reminder_needs_time
  check (reminder_lead_minutes is null or deadline_time is not null);

comment on column public.tasks.deadline_time is
  'Opsiyonel bitis saati. deadline gun, bu kolon saat tutar; ikisi birlikte tam ani verir.';
comment on column public.tasks.reminder_lead_minutes is
  'Hatirlatma bitis saatinden kac dakika once gonderilsin. NULL = hatirlatma yok, 0 = tam saatinde.';
comment on column public.tasks.reminder_sent_at is
  'Hatirlatma gonderildigi an. Ayni gorev icin tekrar gonderilmesini engeller; saat/on sure degisince sunucu sifirlar.';

-- Zamanlanmış iş "hatırlatması kurulu ve henüz gönderilmemiş" görevleri tarar;
-- tam da bu kümeyi daraltan kısmi indeks.
create index if not exists idx_tasks_pending_reminder
  on public.tasks (deadline, deadline_time)
  where reminder_lead_minutes is not null and reminder_sent_at is null;
