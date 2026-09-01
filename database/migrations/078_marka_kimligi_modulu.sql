-- 078_marka_kimligi_modulu.sql
-- Marka Kimliği modülü (A1 — Form / Doküman).
--
-- SORUN:
--   Markaya dair her şey dağılmıştı: vaat ve konumlandırma kimlik_ve_yon'da,
--   ton sosyal medya hesabının içinde, renk/logo hiçbir yerde. Metni kim
--   yazarsa markanın sesi ona göre değişiyordu.
--
-- ÇÖZÜM:
--   Pazarlama departmanı altında tek kayıtlı bir doküman: vaat, kişilik, ton,
--   dil kuralları, renk, tipografi, logo kullanımı. Kimlik ve Yön "neden var
--   olduğumuzu", bu modül "dışarıya nasıl göründüğümüzü" yazar.
--
--   hud_marka_patent_telif ile karıştırılmasın: o tescil takibidir (Hukuk).
--
-- Bkz. docs/moduller/20-motor-a1-form.md §6.3

-- ============================================== 1. Katalog kaydı
--
-- sort_order = 5: pazarlamanın ilk sırasında, çünkü hedef kitle, reklam ve
-- sosyal medya metinlerinin hepsi buradaki karara dayanır.
-- applies_to_freelancer = true: serbest çalışanın da markası vardır.

insert into public.module_catalog
  (key, department_key, name, description, scope, applies_to_freelancer, sort_order)
values
  ('pd_marka_kimligi', 'pazarlama_buyume', 'Marka Kimliği',
   'Markanın vaadini, kişiliğini, ses tonunu ve görsel kurallarını tek sayfada tutar; teklif, reklam ve sosyal medya metinleri aynı yerden beslenir.',
   'organization', true, 5)
on conflict (key) do nothing;

insert into public.module_catalog_departments (module_key, department_key, is_primary, sort_order)
values ('pd_marka_kimligi', 'pazarlama_buyume', true, 5)
on conflict (module_key, department_key) do nothing;

-- Mevcut organizasyonlarda bilerek OTOMATİK AÇILMIYOR: kimlik_ve_yon'un
-- aksine bu modül bir göçün hedefi değil, yeni bir seçenek. Katalogdan açılır.

-- ============================================== 2. Tek kayıt kısıtı
--
-- 050'de kurulan kısmi tekil indeks A1 modüllerinin anahtarlarını listeliyor;
-- listeye yeni anahtar eklemenin tek yolu indeksi yeniden kurmak. Kısıt
-- olmadan modül A1 gibi görünür ama her kaydetmede ikinci satır açardı.

drop index if exists public.module_records_single_row_idx;

create unique index module_records_single_row_idx
  on public.module_records (
    coalesce(organization_id, job_id),
    module_key,
    coalesce(scope_ref, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where archived_at is null
    and module_key in ('kimlik_ve_yon', 'pd_urun_stratejileri', 'pd_marka_kimligi');
