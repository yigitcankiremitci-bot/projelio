-- 171_ofis_duzenleri.sql
-- 3D ofisteki oda düzenleri, ŞİRKET BAŞINA ve ekipte ortak
--
-- NE İÇİN
-- -------
-- Yeni anasayfadaki 3D ofiste (apps/web/src/components/ofis3d) kullanıcı bir
-- odaya girip masaları, modül eşyalarını, bitkileri taşıyabiliyor, döndürüp
-- kaldırabiliyor. Düzen bütün ekipte aynı görünmeli (kullanıcı kararı,
-- 2026-10-31): bu yüzden tarayıcıda değil burada.
--
-- BİÇİM
-- -----
-- Oda başına bir satır; duzen = { nesneler: { "<nesne>": { dx, dz, don, gizli? } } }
-- (packages/shared/src/ofisDuzeni.ts). Konumlar odanın köşesine GÖRE: departman
-- büyüyüp oda planda yer değiştirse de düzen odanın içinde aynı kalır. JSON
-- sunucuda odaDuzeniTemizle ile süzülür; şemaya CHECK konmadı ki yeni nesne
-- türü migration gerektirmesin.
--
-- oda_id: departman kimliği ya da "toplanti" / "ortak" — bu yüzden metin ve
-- FK'sız. Departman silinirse satırı anlamsızlaşır ama zararsızdır: okunurken
-- yalnızca planda olan odaların düzeni kullanılır.
--
-- YETKİ (sunucuda, odaDuzenleyebilir): şirket sahibi her odayı, departman
-- yöneticisi yalnızca kendi departmanının odasını düzenler; görmek için
-- şirketi görebilmek yeter.

create table if not exists public.ofis_oda_duzenleri (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  oda_id          varchar(40) not null,
  duzen           jsonb not null default '{"nesneler": {}}'::jsonb,
  updated_by      uuid references public.users(id) on delete set null,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, oda_id)
);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı.
alter table public.ofis_oda_duzenleri enable row level security;

comment on table public.ofis_oda_duzenleri is
  '3D ofiste oda duzeni (nesne konumlari, odanin kosesine gore). Bicim: shared ofisDuzeni.ts.';
