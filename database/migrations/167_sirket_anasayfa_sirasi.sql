-- Şirket anasayfasındaki bölümlerin (Ürün/Hizmet, Departmanlar, Ekip,
-- Modüller) KULLANICI BAŞINA sırası.
--
-- Önce tarayıcıda (localStorage) tutuluyordu; telefonla bilgisayar arasında
-- taşınmıyordu. Sıra kişisel bir görünüm tercihi: organizations satırına
-- yazılsaydı bir kişinin düzeni herkesinkini değiştirirdi, bu yüzden
-- (kullanıcı, şirket) başına ayrı satır.
--
-- Anahtarlar sunucuda süzülür (packages/shared anasayfaSirasi.ts) — burada
-- kısıt yok, yeni bir bölüm eklemek migration gerektirmesin.

create table if not exists public.sirket_anasayfa_sirasi (
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bolumler text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı.
alter table public.sirket_anasayfa_sirasi enable row level security;
