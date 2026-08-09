-- 044_email_verification.sql
-- Kayıt sırasında e-posta doğrulaması.
--
-- Neden: Bugüne kadar kayıt olurken e-posta adresinin gerçekten kullanıcıya ait
-- olduğu hiç doğrulanmıyordu. Yani sahte/başkasına ait adreslerle hesap açılabilir,
-- ekip davetleri ulaşmayan adreslere gidebilirdi. Artık kullanıcı, e-postasına
-- gelen bağlantıya tıklamadan giriş yapamaz (bkz. AuthService.login).
--
-- Token'ın kendisi SAKLANMAZ, yalnızca SHA-256 hash'i tutulur — password_reset_tokens
-- ile birebir aynı desen (bkz. 043_password_reset_tokens.sql).

-- ============================================== 1. Kullanıcıdaki doğrulama damgası

alter table public.users
  add column if not exists email_verified_at timestamp;

comment on column public.users.email_verified_at is
  'E-postanin dogrulandigi an. Bos ise kullanici giris yapamaz. Google ile acilan hesaplarda kayit aninda doldurulur (Google adresi zaten dogrulamis olur).';

-- MEVCUT KULLANICILAR: bu özellik yokken kaydolmuş herkesi doğrulanmış sayıyoruz.
-- Aksi halde şu an sistemi kullanan gerçek kullanıcılar (siz dahil) bir anda
-- giriş yapamaz hale gelirdi. Doğrulama yalnızca bundan sonraki kayıtlar için işler.
update public.users
set email_verified_at = current_timestamp
where email_verified_at is null;

-- ============================================== 2. Doğrulama token'ları

create table if not exists public.email_verification_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  varchar(64) not null unique,
  expires_at  timestamp not null,
  used_at     timestamp,
  created_at  timestamp not null default current_timestamp
);

comment on table public.email_verification_tokens is
  'Kayit sonrasi gonderilen e-posta dogrulama baglantilarinin token hash''leri. Ham token saklanmaz.';

create index if not exists idx_email_verification_tokens_user_id
  on public.email_verification_tokens(user_id);
create index if not exists idx_email_verification_tokens_expires_at
  on public.email_verification_tokens(expires_at);

alter table public.email_verification_tokens enable row level security;
