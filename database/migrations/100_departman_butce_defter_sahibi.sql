-- 100_departman_butce_defter_sahibi.sql
-- Departman bütçesine girilen gelir/giderlerin owner_id'si boş kalıyordu.
--
-- 020'de kurulan kural: owner_id kaydın HANGİ DEFTERE ait olduğunu tutar ve
-- anasayfadaki Kasa sayfası kayıtları yalnızca bu sütunla süzer. Departman
-- bütçesi 029'da eklenirken bu sütun doldurulmadı; sonuç olarak departman
-- kayıtları hiçbir deftere ait olmadı ve Kasa'da ne listede ne toplamlarda
-- göründü (kod tarafı düzeltmesi: budget.service.ts > addForDepartment).
--
-- Burada geçmiş kayıtlar aynı kurala göre geriye dönük dolduruluyor:
-- departman kaydının defter sahibi, departmanın bağlı olduğu organizasyonun
-- sahibidir.
UPDATE budget_transactions bt
SET owner_id = o.owner_id
FROM departments d
JOIN organizations o ON o.id = d.organization_id
WHERE bt.department_id = d.id
  AND bt.owner_id IS NULL;
