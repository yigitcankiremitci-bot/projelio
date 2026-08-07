-- 037_freelancer_modules.sql
-- Serbest çalışan da modül kullanabilsin.
--
-- İki ayrı eksik vardı:
--   1. module_catalog'da hiçbir satırda applies_to_freelancer=true değildi, bu
--      yüzden anasayfadaki "Modüller" sekmesi her zaman boş görünüyordu
--      (bkz. catalog.service.ts findModules -> freelancerOnly).
--   2. module_records yalnızca organization_id taşıyordu; şirketi olmayan bir
--      kullanıcı bir modüle kayıt giremiyordu. Artık kayıt ya bir organizasyona
--      ya da bir İŞ'e (jobs) bağlanır — ikisi birden değil.

-- ============================================== 1. Kayıtlar iş bazlı da olabilir

alter table public.module_records alter column organization_id drop not null;

alter table public.module_records
  add column if not exists job_id uuid references public.jobs(id) on delete cascade;

comment on column public.module_records.job_id is
  'Serbest calisan modul kayitlari icin sahip is. organization_id ile birlikte DEGIL, onun yerine dolar.';

-- Bir kayıt ya organizasyona ya işe aittir; ikisi birden ya da ikisi birden boş olamaz.
alter table public.module_records drop constraint if exists module_records_owner_chk;
alter table public.module_records
  add constraint module_records_owner_chk
    check (
      (organization_id is not null and job_id is null)
      or (organization_id is null and job_id is not null)
    );

create index if not exists module_records_job_idx
  on public.module_records(job_id) where job_id is not null and archived_at is null;

create index if not exists module_records_job_module_key_idx
  on public.module_records(job_id, module_key) where job_id is not null and archived_at is null;

-- ============================================== 2. Serbest çalışana açılan modüller
-- Seçim ölçütü: tek kişilik bir çalışma düzeninde karşılığı olan modüller.
-- Dışarıda bırakılanlar ya çok kişili/kurumsal yapıyı varsayıyor (İK bordro,
-- depo/sevkiyat/kalite kontrol, holding geneli raporlama) ya da Projelio'nun
-- zaten çekirdek özelliğiyle birebir örtüşüyor (proje/görev/bütçe/dosya
-- yönetimi modülleri — bunlar için ayrı sekmeler var).

update public.module_catalog
set applies_to_freelancer = true
where key in (
  -- YÖNETİM
  'yonetim_vizyon_sablonu',
  'yonetim_misyon_sablonu',
  'yonetim_hedef_belirleme',
  'yonetim_analiz',
  'yonetim_raporlama',
  -- İNSAN KAYNAKLARI (kendi gelişim planı)
  'ik_egitim_gelisim',
  -- FİNANS MUHASEBE
  'fm_gelir_gider',
  'fm_alacak_borc',
  'fm_fatura',
  'fm_finansal_planlama',
  'fm_analiz_rapor',
  'fm_vergi_takip',
  'fm_butce_hazirlama',
  'fm_nakit_akis',
  -- PAZARLAMA ve BÜYÜME
  'pd_rakip_sektor_analizi',
  'pd_hedef_kitle',
  'pd_dijital_pazarlama_seo_sem',
  'pd_sosyal_medya',
  'pd_email',
  'pd_reklam',
  'pd_urun_stratejileri',
  'pd_musteri_kazanim_optimizasyonu',
  'pd_buyume_hedefleri',
  -- SATIŞ ve İŞ GELİŞTİRME
  -- Not: spd_musteri_modulu kasten dışarıda — mid_musteri_modulu ile aynı adı
  -- taşıyor, listede iki kez "Müşteri Modülü" görünmesin.
  'spd_satis_planlama_b2b_b2c',
  'spd_pazar_arastirma',
  -- BİLGİ TEKNOLOJİLERİ / YAZILIM
  'bt_yazilim',
  'bt_donanim',
  -- ÜRÜN YÖNETİMİ
  'uyd_urunler',
  -- MÜŞTERİ İLİŞKİLERİ
  'mid_musteri_modulu',
  'mid_sikayet_oneri',
  'mid_teknik_destek',
  -- HUKUK ve UYUM
  'hud_sozlesme',
  'hud_marka_patent_telif',
  'hud_mevzuatlar'
);
