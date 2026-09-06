-- 091_sekme_gorunurlugu.sql
-- Sekme çubuğu olan dört ekranda "bu sekmeyi hiç gösterme" ayarı
--
-- NE VARDI
-- --------
-- Organizasyon / İş / Departman / Proje sayfalarındaki sekmeler SABİTTİ. Tek
-- gizlenme sebebi yetkiydi (bütçeyi göremeyen bütçe sekmesini görmez, taşeron
-- ekibi görmez — bkz. common/access). Kullanmadığı bir sekmeyi kapatmak
-- isteyen sahibin elinde hiçbir şey yoktu: 6-7 sekmelik çubuk, tek bir sekme
-- kullanılsa bile aynen duruyordu.
--
-- NE DEĞİŞİYOR
-- -----------
-- Her dört tabloya da aynı kolon: kapatılan sekme anahtarlarının listesi.
--
-- NEDEN jsonb ve NEDEN AYNI DESEN
-- -------------------------------
-- Liste kısa, sorgulanmıyor, yalnızca kayıtla birlikte okunup arayüze
-- veriliyor; ilişkisel bir tabloya değecek bir şey yok. jsonb seçildi çünkü
-- PostgREST üzerinden text[] gidiş-dönüşünde dizi biçimi (`{a,b}`) sızıyor,
-- jsonb ise iki tarafta da düz JSON dizisi olarak duruyor.
--
-- Anahtarların DOĞRULUĞU burada değil sunucuda tutuluyor
-- (bkz. packages/shared sanitizeHiddenTabs): tanınmayan anahtar, kilitli sekme
-- ve "hepsini gizle" listesi kayıttan önce eleniyor. Veritabanına CHECK
-- konulmadı, çünkü sekme kümesi arayüzle birlikte değişiyor ve her yeni sekme
-- bir migration daha gerektirirdi.
--
-- Varsayılan '[]' — mevcut kayıtların hiçbirinde davranış değişmez.

alter table public.organizations add column if not exists hidden_tabs jsonb not null default '[]'::jsonb;
alter table public.jobs          add column if not exists hidden_tabs jsonb not null default '[]'::jsonb;
alter table public.departments   add column if not exists hidden_tabs jsonb not null default '[]'::jsonb;
alter table public.projects      add column if not exists hidden_tabs jsonb not null default '[]'::jsonb;

comment on column public.organizations.hidden_tabs is
  'Sahibinin kapattigi sekme anahtarlari (OrgTabs). Bos dizi = hepsi acik.';
comment on column public.jobs.hidden_tabs is
  'Sahibinin kapattigi sekme anahtarlari (JobTabs). Bos dizi = hepsi acik.';
comment on column public.departments.hidden_tabs is
  'Organizasyon sahibinin kapattigi sekme anahtarlari (DepartmentTabs). Bos dizi = hepsi acik.';
comment on column public.projects.hidden_tabs is
  'Sahibinin kapattigi sekme anahtarlari (ProjectTabs). Bos dizi = hepsi acik.';
