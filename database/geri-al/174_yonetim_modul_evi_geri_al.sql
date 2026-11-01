-- 174'ün geri alınışı: YOK, bilerek.
--
-- 174 Yönetim departmanı açtı ve organization_modules.department_id'yi
-- boşalttı. Açılan Yönetim'lere o andan sonra görev, dosya ve kayıt
-- bağlanabilir; silmek onları da (ON DELETE CASCADE) götürür. Boşaltılan
-- department_id'nin eski değeri hep Yönetim'di ve yetki aynı yere çözülüyor —
-- geri yazmanın bir faydası yok.
select 1;
