-- 086_ai_model_ayarlari.sql
-- Lio model kararı kullanıcıdan alınıp admine veriliyor.
--
-- NEDEN: Model seçimi bir MALİYET kararıdır, tercih değil. Kademe seçimi
-- kullanıcıdaydı ve maliyeti 15 kata kadar değiştiriyordu (Haiku $1 → Opus
-- $15 / milyon token); ayrıca sohbet ucundaki `model` alanı hiç korumasızdı,
-- herhangi bir kullanıcı gövdeye yazarak en pahalı modeli çalıştırabiliyordu.
-- Artık hangi kademede hangi modelin çalışacağına yalnızca admin karar verir.
--
-- NEDEN TABLO (ortam değişkeni yerine): AI_PROVIDERS ve AI_MODEL_* zaten var
-- ve çalışıyor, ama her değişiklik sunucuya SSH + yeniden başlatma demek.
-- Bu tablo admin panelinden değiştirilebilsin diye var. Ortam değişkeni
-- KALDIRILMADI: tablo boşsa ya da bir satır yoksa eski davranış aynen sürer,
-- yani bu migration tek başına hiçbir şeyi değiştirmez.
--
-- Tek satırlık bir tablo bilerek tercih edilmedi; kademe başına satır var ki
-- ileride kademe eklenirse şema değişmesin.

create table if not exists public.ai_model_settings (
  -- Kademe kimliği: "fast" | "smart" | "max" (bkz. ai-credits.config.ts).
  tier text primary key,
  -- "saglayici:model" biçiminde tam seçim (ör. "zai:glm-5.3").
  -- NULL = bu kademe için özel bir seçim yok, kod varsayılanı geçerli.
  model_key text,
  -- Kullanıcı bu kademeyi seçebilir mi? Şimdilik hepsi kapalı: karar adminde.
  -- Kolon ileride "kullanıcıya sınırlı seçim aç" istenirse diye duruyor.
  user_selectable boolean not null default false,
  updated_at timestamptz not null default now(),
  -- Kim değiştirdi: yanlış bir seçim faturayı büyütür, izi kalsın.
  updated_by uuid references public.users(id) on delete set null
);

comment on table public.ai_model_settings is
  'Lio kademe -> model eşlemesi. Yalnızca admin değiştirir; satır yoksa ortam değişkeni/kod varsayılanı geçerli (086).';
comment on column public.ai_model_settings.model_key is
  'saglayici:model (ör. "anthropic:claude-sonnet-5"). NULL ise kademenin kod varsayılanı kullanılır (086).';
comment on column public.ai_model_settings.user_selectable is
  'Kullanıcı bu kademeyi seçebilsin mi. Varsayılan false: model kararı admindedir (086).';

-- Üç kademe için satırları oluştur. model_key NULL bırakılıyor: bu migration
-- uygulandığı anda davranış DEĞİŞMESİN, admin bilerek seçene kadar bugünkü
-- varsayılanlar sürsün.
insert into public.ai_model_settings (tier, model_key, user_selectable)
values ('fast', null, false), ('smart', null, false), ('max', null, false)
on conflict (tier) do nothing;

-- Hangi kademenin varsayılan olduğu da admin kararı. Tek satırlık ayar
-- olduğu için ayrı tabloya değil, aynı tabloya özel bir anahtarla konmadı:
-- "default" bir kademe DEĞİL, o yüzden karışmasın diye ayrı tutuluyor.
create table if not exists public.ai_assistant_settings (
  id boolean primary key default true check (id),
  -- Kullanıcıların hepsinin kullanacağı kademe.
  default_tier text not null default 'fast',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);

comment on table public.ai_assistant_settings is
  'Lio geneli ayarlar (tek satır). default_tier: tüm kullanıcıların kullandığı kademe (086).';

insert into public.ai_assistant_settings (id, default_tier)
values (true, 'fast')
on conflict (id) do nothing;

-- Bu tablolara yalnızca sunucu (service_role) erişir; uçlar admin kontrolünü
-- kendi içinde yapıyor. Diğer tablolarla aynı kalıp (bkz. 062).
alter table public.ai_model_settings enable row level security;
alter table public.ai_assistant_settings enable row level security;
