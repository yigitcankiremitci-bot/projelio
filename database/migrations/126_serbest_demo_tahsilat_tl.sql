-- 126: Serbest çalışan demosunda (124) müşteri ödemeleri ₺.
--
-- NEDEN: Kasa'nın proje tahsilat özeti yalnızca ₺ kayıtları topluyor (kur
-- dönüşümü bilerek yok, bkz. CLAUDE.md "Bütçe"). EUR yazılan müşteri
-- ödemeleri yüzünden EP projesi "€1.600 alındı" olduğu hâlde özet "0 ₺ alındı"
-- gösteriyordu — demo, bozuk bir hesap gibi görünüyordu. Döviz örneği
-- yazılım aboneliklerinde (Adobe EUR, Splice USD) kalıyor.
update budget_transactions set amount = 48000, currency = 'TRY'
where id = 'ce11f015-0000-4000-8000-000000000001' and currency = 'EUR';
update budget_transactions set amount = 60000, currency = 'TRY'
where id = 'ce11f015-0000-4000-8000-000000000004' and currency = 'EUR';

update module_records set data = data || jsonb_build_object('amount', 48000, 'currency', 'TRY')
where id = 'ce11f009-0000-4000-8000-000000000001';
update module_records set data = data || jsonb_build_object('amount', 37500, 'currency', 'TRY')
where id = 'ce11f009-0000-4000-8000-000000000003';
update module_records set data = data || jsonb_build_object('amount', 60000, 'currency', 'TRY')
where id = 'ce11f009-0000-4000-8000-000000000004';
