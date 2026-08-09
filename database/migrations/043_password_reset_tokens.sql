-- 043_password_reset_tokens.sql
-- "Şifremi unuttum" akışı için gerekli tablo.
--
-- Ne için: kullanıcı e-posta ile bir sıfırlama bağlantısı ister; bağlantıdaki
-- token doğrulanınca şifre güncellenir. Token'ın kendisi DB'de SAKLANMAZ —
-- yalnızca SHA-256 hash'i tutulur (bkz. auth/password-reset.service.ts), böylece
-- veritabanı bir şekilde okunsa bile token'lar doğrudan kullanılamaz (password_hash
-- için bcrypt kullanılmasıyla aynı gerekçe).
--
-- Bir kullanıcının aynı anda birden fazla geçerli token'ı olabilir (ör. art arda
-- iki kez "bağlantıyı tekrar gönder" dediyse) — sorun değil, ilk kullanılan
-- geçerli token işlemi tamamlar, reset sırasında kullanıcının TÜM token'ları
-- iptal edilir (bkz. PasswordResetService.resetPassword).

create table if not exists public.password_reset_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  varchar(64) not null unique,
  expires_at  timestamp not null,
  used_at     timestamp,
  created_at  timestamp not null default current_timestamp
);

create index if not exists idx_password_reset_tokens_user_id on public.password_reset_tokens(user_id);
-- Süresi geçmiş/kullanılmış eski kayıtları temizlemek için (isteğe bağlı, cron ile).
create index if not exists idx_password_reset_tokens_expires_at on public.password_reset_tokens(expires_at);

alter table public.password_reset_tokens enable row level security;
