#!/usr/bin/env bash
# Dump the live Supabase schema (DDL only, no data) so it can be compared with
# the migration files and replayed on the self-hosted VPS Postgres.
#
# Usage:
#   ./deploy/dump-supabase-schema.sh              # write the dump files
#   ./deploy/dump-supabase-schema.sh --dry-run    # only test the connection
#   PG_MODE=docker ./deploy/dump-supabase-schema.sh   # force the docker path
#
# The connection string lives in deploy/.env.dump and never reaches stdout.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.dump"
PROD_ENV_FILE="$SCRIPT_DIR/../.env.prod"
OUT_PUBLIC="$SCRIPT_DIR/canli-sema.sql"
OUT_STORAGE="$SCRIPT_DIR/canli-sema-storage.sql"

# Canlı Supabase PostgreSQL 17.6 çalıştırıyor; daha eski pg_dump bağlanmayı
# reddeder. İstemciyi hedef ana sürümle aynı tutuyoruz.
REQUIRED_MAJOR=17
DOCKER_IMAGE="postgres:17"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "ERROR: $*" >&2; exit 1; }

# The connection string carries the database password, so every failure path has
# to scrub it before anything is printed.
mask() { sed -E 's#(postgres(ql)?://[^:]+:)[^@]*@#\1****@#g'; }

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
elif [ -f "$PROD_ENV_FILE" ]; then
  # The migration hand-off keeps only the DB password and service-role JWT in
  # the repository root. Derive the project ref from the JWT issuer locally so
  # neither secret has to be duplicated into another file.
  # shellcheck disable=SC1090
  set -a; . "$PROD_ENV_FILE"; set +a

  [ -n "${SUPABASE_DB_PASSWORD:-}" ] || die "SUPABASE_DB_PASSWORD is not set in $PROD_ENV_FILE"
  [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] || die "SUPABASE_SERVICE_ROLE_KEY is not set in $PROD_ENV_FILE"
  command -v node >/dev/null 2>&1 || die "node is required to derive the Supabase project ref from the service-role JWT."

  project_ref="${SUPABASE_PROJECT_REF:-}"
  if [ -z "$project_ref" ] && [ -n "${SUPABASE_URL:-}" ]; then
    project_ref="$(node -e '
      try {
        const host = new URL(process.env.SUPABASE_URL).hostname;
        const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
        if (!match) process.exit(2);
        process.stdout.write(match[1]);
      } catch { process.exit(2); }
    ')" || die "Could not derive the Supabase project ref from SUPABASE_URL."
  fi
  if [ -z "$project_ref" ] && [[ "$SUPABASE_SERVICE_ROLE_KEY" == *.*.* ]]; then
    project_ref="$(node -e '
    const token = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    try {
      const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      const host = new URL(payload.iss).hostname;
      const match = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      if (!match) process.exit(2);
      process.stdout.write(match[1]);
    } catch { process.exit(2); }
    ')" || die "Could not derive the Supabase project ref from SUPABASE_SERVICE_ROLE_KEY."
  fi
  [ -n "$project_ref" ] || die "Set SUPABASE_PROJECT_REF or SUPABASE_URL in $PROD_ENV_FILE; sb_secret_ service-role keys do not contain the project ref."
  encoded_password="$(node -e 'process.stdout.write(encodeURIComponent(process.env.SUPABASE_DB_PASSWORD || ""))')"
  # Direct DB hostu yalnız IPv6 yayınlıyor ve bu VPS'ten TCP erişimi yok.
  # Session Pooler pg_dump için kalıcı oturum sağlar; transaction pooler kullanılmaz.
  pooler_region="${SUPABASE_DB_POOLER_REGION:-eu-central-1}"
  db_host="${SUPABASE_DB_HOST:-aws-0-${pooler_region}.pooler.supabase.com}"
  db_user="${SUPABASE_DB_USER:-postgres.${project_ref}}"
  SUPABASE_DB_URL="postgresql://${db_user}:${encoded_password}@${db_host}:5432/postgres?sslmode=require"
else
  cat >&2 <<EOF
ERROR: neither $ENV_FILE nor $PROD_ENV_FILE was found.

Create it with a single line:

  SUPABASE_DB_URL=postgresql://postgres:<PASSWORD>@<HOST>:5432/postgres

Where to get it:
  Supabase Dashboard -> Project Settings -> Database -> Connection string
  -> Connect -> "Session pooler". Transaction pooler kullanma; pg_dump kalıcı
  oturum ister. Replace [YOUR-PASSWORD] with the database password.

Make sure the file is git-ignored before saving the password into it.
EOF
  exit 1
fi

[ -n "${SUPABASE_DB_URL:-}" ] || die "SUPABASE_DB_URL is not set in $ENV_FILE"

# --- pick the client -------------------------------------------------------
# Never silently fall back to docker: the user must know which client produced
# the dump, because the two paths differ in networking and file ownership.

local_major=""
if command -v pg_dump >/dev/null 2>&1; then
  local_major="$(pg_dump --version | grep -oE '[0-9]+' | head -n1)"
fi

MODE="${PG_MODE:-}"
if [ -z "$MODE" ]; then
  if [ -n "$local_major" ] && [ "$local_major" -ge "$REQUIRED_MAJOR" ]; then
    MODE=local
  elif command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    MODE=docker
  elif [ -n "$local_major" ]; then
    die "Local pg_dump is version $local_major but the server needs >= $REQUIRED_MAJOR, and docker is not available. Install Postgres $REQUIRED_MAJOR client tools or start Docker."
  else
    die "Neither pg_dump nor a running docker daemon was found. Install the Postgres $REQUIRED_MAJOR client tools or start Docker."
  fi
fi

case "$MODE" in
  local)
    echo "Client: local pg_dump ${local_major:-?}"
    run_dump() { pg_dump "$SUPABASE_DB_URL" "$@"; }
    run_psql()  { psql "$SUPABASE_DB_URL" "$@"; }
    ;;
  docker)
    echo "Client: docker $DOCKER_IMAGE (local pg_dump ${local_major:-absent})"
    docker info >/dev/null 2>&1 || die "PG_MODE=docker but the docker daemon is not reachable."
    run_dump() { docker run --rm -i -e PGURL="$SUPABASE_DB_URL" "$DOCKER_IMAGE" \
                   sh -c 'exec pg_dump "$PGURL" "$@"' -- "$@"; }
    run_psql()  { docker run --rm -i -e PGURL="$SUPABASE_DB_URL" "$DOCKER_IMAGE" \
                   sh -c 'exec psql "$PGURL" "$@"' -- "$@"; }
    ;;
  *)
    die "PG_MODE must be 'local' or 'docker', got '$MODE'"
    ;;
esac

# --- connection check ------------------------------------------------------

echo "Testing the connection..."
if ! run_psql -At -c 'select version()' 2> >(mask >&2); then
  die "Could not connect. Check SUPABASE_DB_URL in $ENV_FILE (direct connection, port 5432)."
fi

if [ "$DRY_RUN" -eq 1 ]; then
  echo "Dry run finished: the connection works, no dump was written."
  exit 0
fi

# --- dumps -----------------------------------------------------------------
# public  = the application schema
# storage = Supabase Storage bucket/object definitions, needed to recreate the
#           buckets on the self-hosted side.

dump_schema() {
  local schema="$1" out="$2"
  echo "Dumping schema '$schema' -> $out"
  if ! run_dump --schema-only --no-owner --no-privileges --schema="$schema" \
       > "$out.tmp" 2> >(mask >&2); then
    rm -f "$out.tmp"
    die "pg_dump failed for schema '$schema'."
  fi
  mv "$out.tmp" "$out"
  echo "  $(wc -l < "$out") lines"
}

dump_schema public  "$OUT_PUBLIC"
dump_schema storage "$OUT_STORAGE"

echo
echo "Done. Next: ./deploy/karsilastir-sema.sh"
