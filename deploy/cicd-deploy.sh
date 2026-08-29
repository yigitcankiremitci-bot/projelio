#!/usr/bin/env bash
set -Eeuo pipefail

REPO="yigitcankiremitci-bot/projelio"
BRANCH="main"
ROOT="/srv/projelio"
SOURCE="$ROOT/.cicd/source"
STATE="$ROOT/.cicd/state"
LOCK="$ROOT/.cicd/deploy.lock"
COMPOSE="$ROOT/deploy/docker-compose.prod.yml"
GITHUB_TOKEN_FILE="/etc/projelio/github-actions-token"
GIT_REMOTE="https://github.com/$REPO.git"

mkdir -p "$ROOT/.cicd"
exec 9>"$LOCK"
flock -n 9 || exit 0

[[ -r "$GITHUB_TOKEN_FILE" ]] || exit 0
GITHUB_TOKEN="$(<"$GITHUB_TOKEN_FILE")"
export GITHUB_TOKEN
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS="/etc/projelio/github-git-askpass"

if ! api_json="$(curl --fail --silent \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  "https://api.github.com/repos/$REPO/actions/workflows/ci.yml/runs?branch=$BRANCH&event=push&per_page=1")"; then
  # Workflow repoya ilk kez gönderilmeden önce GitHub 404 döndürür.
  exit 0
fi

read -r candidate conclusion < <(python3 -c '
import json, sys
runs = json.load(sys.stdin).get("workflow_runs", [])
if not runs:
    raise SystemExit(1)
run = runs[0]
print(run["head_sha"], run.get("conclusion") or "pending")
' <<<"$api_json")

[[ "$conclusion" == "success" ]] || exit 0
[[ "$(cat "$STATE" 2>/dev/null || true)" != "$candidate" ]] || exit 0

if [[ ! -d "$SOURCE/.git" ]]; then
  git clone --filter=blob:none --branch "$BRANCH" "$GIT_REMOTE" "$SOURCE"
fi

git -C "$SOURCE" remote set-url origin "$GIT_REMOTE"

git -C "$SOURCE" fetch --quiet origin "$BRANCH"
[[ "$(git -C "$SOURCE" rev-parse "origin/$BRANCH")" == "$candidate" ]] || exit 0

previous="$(cat "$STATE" 2>/dev/null || true)"
git -C "$SOURCE" checkout --quiet --detach "$candidate"

sync_source() {
  rsync -a --delete \
    --exclude '.git/' \
    --exclude '.cicd/' \
    --exclude 'data/' \
    --exclude 'logs/' \
    --exclude 'deploy/.env' \
    --exclude 'deploy/.env.prod' \
    --exclude 'deploy/canli-*' \
    "$SOURCE/" "$ROOT/"
}

deploy_and_check() {
  docker compose -f "$COMPOSE" config --quiet
  docker compose -f "$COMPOSE" build backend caddy landing
  docker compose -f "$COMPOSE" up -d --remove-orphans
  docker compose -f "$COMPOSE" ps --status running --services | grep -qx backend
  docker compose -f "$COMPOSE" ps --status running --services | grep -qx landing
  curl --fail --silent --show-error --retry 12 --retry-delay 5 \
    --retry-connrefused http://127.0.0.1/ >/dev/null
  curl --fail --silent --show-error --retry 12 --retry-delay 5 \
    --retry-connrefused -H 'Host: api.193.111.77.252.sslip.io' \
    http://127.0.0.1/health >/dev/null
  curl --fail --silent --show-error --retry 12 --retry-delay 5 \
    --retry-connrefused http://127.0.0.1:3001/ >/dev/null
}

sync_source
if deploy_and_check; then
  printf '%s\n' "$candidate" >"$STATE"
  docker image prune -f --filter 'until=168h' >/dev/null
  exit 0
fi

echo "Deploy başarısız; önceki commit geri yükleniyor." >&2
if [[ "$previous" =~ ^[0-9a-f]{40}$ ]]; then
  git -C "$SOURCE" checkout --quiet --detach "$previous"
  sync_source
  deploy_and_check
fi
exit 1
