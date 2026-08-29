#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "HATA: /srv/projelio/deploy/.env bulunamadı." >&2
  exit 1
fi

set -a
# Sunucudaki dosya yalnız yönetici tarafından yazılır ve değerler hex/JWT biçimindedir.
# shellcheck disable=SC1091
source .env
set +a

append_secret() {
  local name="$1"
  local value="$2"
  if ! grep -q "^${name}=" .env; then
    printf '\n%s=%s\n' "$name" "$value" >>.env
  fi
}

# Aşama C'deki JWT_SECRET, Storage'ın mevcut ve doğrulanmış HMAC sırrıdır.
# Yeni ad iki farklı JWT alanını birbirine karıştırmayı önler.
if [[ -z "${SUPABASE_JWT_SECRET:-}" ]]; then
  if [[ -z "${JWT_SECRET:-}" ]]; then
    echo "HATA: JWT_SECRET/SUPABASE_JWT_SECRET bulunamadı." >&2
    exit 1
  fi
  SUPABASE_JWT_SECRET="$JWT_SECRET"
  append_secret SUPABASE_JWT_SECRET "$SUPABASE_JWT_SECRET"
fi

if [[ -z "${APP_JWT_SECRET:-}" ]]; then
  APP_JWT_SECRET="$(openssl rand -hex 32)"
  append_secret APP_JWT_SECRET "$APP_JWT_SECRET"
fi

if [[ -z "${AUTHENTICATOR_DB_PASSWORD:-}" ]]; then
  AUTHENTICATOR_DB_PASSWORD="$(openssl rand -hex 24)"
  append_secret AUTHENTICATOR_DB_PASSWORD "$AUTHENTICATOR_DB_PASSWORD"
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SUPABASE_SERVICE_ROLE_KEY="$(SUPABASE_JWT_SECRET="$SUPABASE_JWT_SECRET" python3 - <<'PY'
import base64, hashlib, hmac, json, os, time

def enc(value):
    raw = json.dumps(value, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")

header = enc({"alg": "HS256", "typ": "JWT"})
payload = enc({"role": "service_role", "iss": "projelio-self-hosted", "iat": int(time.time())})
message = f"{header}.{payload}"
signature = hmac.new(os.environ["SUPABASE_JWT_SECRET"].encode(), message.encode(), hashlib.sha256).digest()
print(f"{message}.{base64.urlsafe_b64encode(signature).decode().rstrip('=')}")
PY
)"
  append_secret SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
fi

chmod 600 .env

# PostgreSQL 17 Supabase imajında `postgres` bilinçli olarak superuser değildir.
# Rol yönetimini imajın yönetici hesabı `supabase_admin` ile yapmak gerekir.
docker exec -i projelio-postgres psql -v ON_ERROR_STOP=1 -U supabase_admin -d "${POSTGRES_DB:-postgres}" \
  -v auth_password="$AUTHENTICATOR_DB_PASSWORD" <<'SQL'
SELECT format(
  CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator')
    THEN 'ALTER ROLE authenticator WITH LOGIN NOINHERIT PASSWORD %L'
    ELSE 'CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD %L'
  END,
  :'auth_password'
) \gexec
GRANT anon, authenticated, service_role TO authenticator;
SQL

echo "PostgREST sırları ve authenticator rolü hazırlandı; değerler gösterilmedi."
