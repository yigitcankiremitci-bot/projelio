-- 172_ise_alim_yeni_departman.sql
-- İşe alım davetinde "kişiyle birlikte açılacak departman"
--
-- NE İÇİN
-- -------
-- Departman artık İLK KİŞİSİYLE doğuyor (kullanıcı kararı, 2026-11-01; kural
-- packages/shared/src/departmanKurali.ts): yönetici dışında biri olmadan
-- departman açılamıyor. Şirkete kişi ise yalnızca bir departman üzerinden
-- katılabiliyor — departmansız bir şirkete ilk çalışanı davet etmek için
-- davetin, kişiyle birlikte açılacak departmanı taşıması gerekiyor.
--
-- Departman davet anında DEĞİL, kişi kabul edince açılır: reddedilen ya da
-- süresi geçen davet boş departman bırakmasın.
--
-- BİÇİM
-- -----
-- { "catalogKey"?: "<department_catalog.key>", "name"?: "<özel ad>",
--   "role": "manager" | "employee" | "subcontractor" } ya da NULL.
-- Doğrulama sunucuda (ekip-hesabi-kurallari.ts yeniDepartmaniDogrula).

alter table ise_alim_davetleri
  add column if not exists yeni_departman jsonb;
