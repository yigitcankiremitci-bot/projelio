-- Kurulum sihirbazının genişletilmiş "Seni tanıyalım" adımı.
--
-- Sihirbaz önceden yalnızca account_type'ı yazıyordu; artık kişisel profil ve
-- kullanım tercihleri de aynı akışta toplanıyor. Hepsi NULLABLE: adım atlanabilir
-- olsun diye. Zorunlu yapmak, onboarding'i tamamlayamayan kullanıcı yaratırdı —
-- sihirbaz kapatılamadığı için bu kişi uygulamaya hiç giremezdi.

alter table public.users
  add column if not exists phone varchar(30),
  add column if not exists sector varchar(40),
  add column if not exists team_size varchar(20),
  add column if not exists use_cases text[],
  add column if not exists onboarding_modules text[];

comment on column public.users.phone is
  'Sihirbazda girilen iletişim telefonu. Doğrulanmaz ve giriş/kimlik akışında KULLANILMAZ — yalnızca profilde gösterilir. Doğrulama gerekirse ayrı bir sütun eklenmeli, buna güvenilmemeli.';

comment on column public.users.sector is
  'packages/shared/src/types.ts içindeki Sector değerlerinden biri. Kapalı uçlu liste: serbest metin olsaydı aynı sektör onlarca farklı yazımla kaydedilirdi.';

comment on column public.users.team_size is
  'packages/shared/src/types.ts içindeki TeamSize değerlerinden biri.';

comment on column public.users.use_cases is
  'UseCase anahtarları (çoklu seçim). Arayüzü kişiselleştirmek için — yetki taşımaz.';

comment on column public.users.onboarding_modules is
  'Sihirbazda işaretlenen module_catalog.key değerleri. YETKİ DEĞİLDİR, yalnızca tercih/öneri kaydı: bir modüle gerçek erişim departman üyeliğinden gelir. Erişim kontrolünde bu sütuna bakılmamalı.';
