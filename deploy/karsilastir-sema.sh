#!/usr/bin/env bash
# Compare the table list of the live Supabase schema with the tables the
# migration files under database/migrations/ would create. Drift in either
# direction is a migration that was applied by hand, or a table that only ever
# existed in a migration.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIVE_SQL="$SCRIPT_DIR/canli-sema.sql"
MIGRATIONS_DIR="$REPO_ROOT/database/migrations"

[ -f "$LIVE_SQL" ] || {
  echo "ERROR: $LIVE_SQL not found. Run ./deploy/dump-supabase-schema.sh first." >&2
  exit 1
}
[ -d "$MIGRATIONS_DIR" ] || {
  echo "ERROR: $MIGRATIONS_DIR not found." >&2
  exit 1
}

tmp_live="$(mktemp)"
tmp_mig="$(mktemp)"
trap 'rm -f "$tmp_live" "$tmp_mig"' EXIT

# pg_dump always writes `CREATE TABLE public.<name> (`, one per line.
grep -hoiE '^CREATE TABLE (IF NOT EXISTS )?(public\.)?"?[a-z0-9_]+"?' "$LIVE_SQL" \
  | sed -E 's/.*[. ]"?([a-z0-9_]+)"?$/\1/I' \
  | sort -u > "$tmp_live"

# Migrations are hand-written, so the schema prefix and IF NOT EXISTS are optional.
grep -rhoiE '^[[:space:]]*CREATE TABLE (IF NOT EXISTS )?(public\.)?"?[a-z0-9_]+"?' \
  "$MIGRATIONS_DIR"/*.sql \
  | sed -E 's/.*[. ]"?([a-z0-9_]+)"?$/\1/I' \
  | sort -u > "$tmp_mig"

echo "=== Only in the live database (no migration creates it) ==="
comm -23 "$tmp_live" "$tmp_mig" || true
echo

echo "=== Only in the migrations (missing from the live database) ==="
comm -13 "$tmp_live" "$tmp_mig" || true
echo

echo "=== Totals ==="
printf 'live:       %s\n' "$(wc -l < "$tmp_live")"
printf 'migrations: %s\n' "$(wc -l < "$tmp_mig")"
printf 'in both:    %s\n' "$(comm -12 "$tmp_live" "$tmp_mig" | wc -l)"
