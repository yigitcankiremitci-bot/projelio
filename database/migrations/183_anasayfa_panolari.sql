-- Anasayfa panosunun KİŞİ BAŞINA düzeni (hangi özet kartı, hangi sırada, hangi
-- boyutta). Telefonla bilgisayar aynı panoyu görsün diye hesapta.
--
-- Kapsam: serbest çalışanın kendi panosu için 'me', şirket panosu için şirketin
-- kimliği. Bu yüzden organizations'a yabancı anahtar YOK: sütun iki türü de
-- taşıyor. Satırın içinde yalnızca kişinin kendi görünüm tercihi var, başka
-- kimseye gösterilmiyor.
--
-- Kart kimlikleri ve boyutlar sunucuda süzülür (packages/shared anasayfaPano.ts)
-- — burada kısıt yok, yeni bir kart eklemek migration gerektirmesin.

create table if not exists public.anasayfa_panolari (
  user_id uuid not null references public.users(id) on delete cascade,
  kapsam text not null,
  kartlar jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kapsam)
);

-- Erişim yalnızca sunucu (service role) üzerinden; komşu tablolarla aynı.
alter table public.anasayfa_panolari enable row level security;
