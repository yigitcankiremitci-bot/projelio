-- 153_baglantilar geri alma. Bağlantılar'a özgü alanlar (önem, tanışma yeri,
-- ilişki notu) SİLİNİR — önce yedek al.
--
-- Yalnızca Bağlantılar'da duran kartlar party'de kalır ama modules sütunu
-- düşünce varsayılan davranışa döner: Müşteriler listesinde görünürler.
-- İstenmiyorsa önce onları arşivle:
--   update public.party set archived_at = now()
--   where not ('crm_musteri' = any(modules)) and archived_at is null;

delete from public.module_catalog_departments where module_key = 'baglantilar';
delete from public.module_catalog where key = 'baglantilar';
drop table if exists public.party_baglanti;
drop index if exists public.party_modules_idx;
alter table public.party drop column if exists modules;
