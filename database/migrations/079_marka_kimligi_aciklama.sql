-- 079_marka_kimligi_aciklama.sql
-- pd_marka_kimligi modülünün katalog açıklaması genişletildi.
--
-- 078'de modül dört bölümlüydü (öz, ses, görünüm, durum). Modül dokuz bölüme
-- çıktı: konum, öz, kişilik, ses, ad/yazım, görünüm, temas noktaları, koruma,
-- durum. Katalogdaki açıklama modülü kurulum listesinde tanıtan tek metin —
-- eski hâli modülün yaptığının yarısını anlatıyordu.
--
-- Bkz. docs/moduller/20-motor-a1-form.md §6.3

update public.module_catalog
set description = 'Markanın nerede yarıştığını, ne vaat ettiğini, nasıl konuştuğunu ve neye benzediğini tek sayfada tutar: konum, vaat ve kanıtlar, arketip ve kişilik, ses tonu, ad ve yazım kuralları, renk/logo/görsel dil, temas noktaları, tescil ve alan adları. Teklif, reklam ve sosyal medya metinleri aynı yerden beslenir.'
where key = 'pd_marka_kimligi';
