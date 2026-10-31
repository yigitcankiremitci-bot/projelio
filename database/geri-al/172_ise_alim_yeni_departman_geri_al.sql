-- 172_ise_alim_yeni_departman geri alma
-- Bekleyen davetlerdeki "kişiyle açılacak departman" bilgisi kaybolur; o
-- davetler kabul edilince yalnızca mevcut departmanlara yazılır (hiç yoksa
-- kabul "Davetteki departmanlar artık yok" hatası verir).
alter table ise_alim_davetleri drop column if exists yeni_departman;
