-- 113_modul_lio_yardimi.sql
-- Modül başına "Lio yardımı" anahtarı
--
-- NE İÇİN
-- -------
-- Fatura modülüne bırakılan bir belgeyi (PDF ya da fişin fotoğrafı) Lio okuyup
-- kaydı ve kasa hareketini kendisi açabiliyor (bkz. fatura-okuma.ts). Bu
-- DAVRANIŞ DEĞİŞİKLİĞİ ve parayla ilgili: her yüklemede AI kredisi harcanıyor,
-- üstüne deftere kayıt düşüyor. Varsayılan olarak açık olamaz.
--
-- NEDEN MODÜL SATIRINDA, KULLANICIDA DEĞİL
-- ----------------------------------------
-- Karar ekibin: aynı modüle beş kişi belge bırakıyorsa beşinin de aynı
-- davranışı görmesi gerekiyor. Kullanıcı başına tutulsaydı, aynı klasöre atılan
-- iki fatura birinde otomatik işlenir, diğerinde sessizce beklerdi ve ay sonunda
-- kimse farkı açıklayamazdı.
--
-- Sütun İKİ TABLOYA da ekleniyor: modül bir şirkete (organization_modules) ya da
-- serbest çalışanın işine (job_modules) atanabiliyor ve ikisi de aynı panelden
-- görünüyor. Yalnızca birine eklemek, anahtarın diğer ekranda sessizce yok
-- sayılması demekti.

alter table public.organization_modules
  add column if not exists ai_assist boolean not null default false;

alter table public.job_modules
  add column if not exists ai_assist boolean not null default false;

comment on column public.organization_modules.ai_assist is
  'Module birakilan belgeyi Lio okuyup kayit + kasa hareketi acsin mi. Varsayilan kapali: her okuma AI kredisi harciyor.';
comment on column public.job_modules.ai_assist is
  'Module birakilan belgeyi Lio okuyup kayit + kasa hareketi acsin mi. Varsayilan kapali: her okuma AI kredisi harciyor.';
