-- 182_ofis_karakterleri.sql
-- 3D ofiste kişinin kendi seçtiği karakter görünümü
--
-- Ofiste herkes bir karakterle görünüyor; şimdiye dek model kişinin ADINDAN
-- türetiliyordu (web apps/web/src/components/ofis3d/varliklar.ts), seçilemiyordu.
-- Artık kişi kendi karakterine tıklayıp modelini, ten / saç / kıyafet rengini
-- seçebiliyor. Görünüm kişiye ait (şirkete ya da işe değil): aynı kişi her
-- ofiste aynı görünür. Biçim ve izinli seçenekler packages/shared/src/karakterGorunumu.ts.
--
-- Satırı yalnızca kişinin kendisi yazar (uç: POST /ofis-duzeni/karakter);
-- okuma herkese açık — karakter ofiste zaten herkese görünüyor.
-- Satırı olmayan kişi eskisi gibi adından türetilen karakterle görünür.

create table if not exists public.ofis_karakterleri (
  user_id     uuid primary key references public.users(id) on delete cascade,
  gorunum     jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı.
alter table public.ofis_karakterleri enable row level security;

comment on table public.ofis_karakterleri is
  '3D ofiste kisinin sectigi karakter: model + ten/sac/kiyafet rengi. Bicim: shared karakterGorunumu.ts.';
