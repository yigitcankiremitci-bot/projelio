-- 170_party_listeleri_ve_ozel_sira.sql
-- 1) Bağlantı listeleri (migration 163) Müşteriler modülünde de: aynı tablo,
--    `modul` sütunuyla ayrılan iki defter. Müşteri listeleri Müşteriler,
--    Potansiyel ve Tahsilat takibi sekmelerinde ortak (potansiyel müşteriye
--    dönüşünce listesinden düşmesin — liste bir etiket).
-- 2) Özel sıralama: kart sürüklenerek yeniden dizilince sıra kaydedilir
--    (kullanıcı isteği, 2026-10-26). Sıra ekibin ortak görünümü — liste gibi;
--    kapsam + defter + görünüm (sekme ve liste) başına bir satır.
--
-- Eski satırlar 'baglantilar' olarak kalır; ad tekilliği artık defter başına
-- (Bağlantılar'daki "İTS 2026" ile Müşteriler'deki "İTS 2026" çakışmasın).

alter table public.baglanti_listeleri
  add column if not exists modul varchar(40) not null default 'baglantilar';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'baglanti_listeleri_modul_chk') then
    alter table public.baglanti_listeleri
      add constraint baglanti_listeleri_modul_chk check (modul in ('baglantilar', 'crm_musteri'));
  end if;
end $$;

drop index if exists public.baglanti_listeleri_ad_uniq;
create unique index if not exists baglanti_listeleri_ad_uniq
  on public.baglanti_listeleri (coalesce(organization_id, job_id), modul, lower(trim(ad)));

create table if not exists public.party_ozel_siralar (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  job_id          uuid references public.jobs(id) on delete cascade,
  modul           varchar(40) not null,
  -- "<sekme>:<liste kimliği | tumu>", ör. "musteriler:tumu", "baglantilar:<uuid>".
  anahtar         varchar(120) not null,
  -- Kart kimlikleri sırasıyla. Silinen/listeden çıkan kart istemcide atlanır;
  -- sırada olmayan (yeni) kart sona eklenir.
  sira            uuid[] not null default '{}',
  guncelleyen     uuid references public.users(id) on delete set null,
  updated_at      timestamp not null default current_timestamp,
  constraint party_ozel_siralar_kapsam_chk check (num_nonnulls(organization_id, job_id) = 1)
);

create unique index if not exists party_ozel_siralar_uniq
  on public.party_ozel_siralar (coalesce(organization_id, job_id), modul, anahtar);

comment on table public.party_ozel_siralar is
  'Musteri/baglanti listelerinin surukle-birak ile verilen ozel sirasi (ekibin ortak gorunumu).';

alter table public.party_ozel_siralar enable row level security;
