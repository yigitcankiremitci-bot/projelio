-- 111_hizmet_projesi.sql
--
-- Başkasının İŞİ altında açılmış, iş sahibine HİZMET VERİLEN proje.
--
-- NEDEN. Hiyerarşi projeyi bağlı olduğu işe TOPLAR (bkz. 104). Bu, bir şirkette
-- patronun işi altında proje açan çalışan için doğru: para şirketindir. Ama
-- "Deniz Kızı Şarkı" işinin sahibi Arda, altındaki "Deniz Kızı Single"
-- projesinin sahibi ona hizmet veren biriyse yanlış: Arda'nın ödediği 10.000 ₺
-- hizmet veren için gelir, Arda için GİDERDİR; toplama onu Arda'nın işine gelir
-- olarak ekliyordu, hizmet verenin kendi masraflarını da Arda'nın gideri
-- olarak.
--
-- Otomatik anlaşılamaz ("proje sahibi ≠ iş sahibi" kuralı şirket çalışanlarının
-- bütçesini bozardı), bu yüzden elle işaretlenen bir bayrak. İşaretliyken:
--   • projenin defteri yalnızca proje sahibinindir, işe TOPLANMAZ;
--   • projedeki gelir satırları (iş sahibinin ödemeleri) işe GİDER olarak
--     yansır — satır tek, kopya yok (bkz. hizmet-anlasmasi.ts);
--   • anlaşma tutarı projenin total_budget'ıdır.

alter table public.projects
  add column if not exists hizmet_projesi boolean not null default false;

comment on column public.projects.hizmet_projesi is
  'Proje sahibi, projenin bağlı olduğu işin sahibine hizmet veriyor: defter işe toplanmaz, gelirler işe gider olarak yansır (111).';
