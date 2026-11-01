#!/usr/bin/env bash
# searxng-kur.sh — Ajan MVP'nin arama motorunu (SearXNG) VPS'e kurar/günceller.
#
# NE YAPAR:
#   1. deploy/searxng/ içeriğini sunucuda ~/apps/searxng'ye kopyalar.
#   2. Orada .env yoksa SEARXNG_SECRET üretir; varsa dokunmaz.
#   3. `docker compose up -d` ile başlatır ve JSON aramasını dener.
#
# Port yalnızca VPS'in Tailscale adresinde (100.111.242.24:8888) dinler; bkz.
# deploy/searxng/docker-compose.yml başlığı. Ana dağıtıma bağlı değil: main'e
# push etmek SearXNG'ye dokunmaz, güncellemek için bu betiği yeniden koş.
#
# KULLANIM (Mac'te, repo kökünde; SSH tailnet üzerinden):
#   bash deploy/searxng-kur.sh
#   bash deploy/searxng-kur.sh --kaldir

set -Eeuo pipefail

SUNUCU="${PROJELIO_SUNUCU:-projelio@100.111.242.24}"
HEDEF="apps/searxng"
KAYNAK="$(cd "$(dirname "$0")/searxng" && pwd)"

if [[ "${1:-}" == "--kaldir" ]]; then
  ssh "$SUNUCU" "cd ~/$HEDEF && docker compose down"
  echo "SearXNG durduruldu (dosyalar ~/$HEDEF içinde duruyor)."
  exit 0
fi

ssh "$SUNUCU" "mkdir -p ~/$HEDEF"
scp -q "$KAYNAK/docker-compose.yml" "$KAYNAK/settings.yml" "$SUNUCU:$HEDEF/"
ssh "$SUNUCU" bash -s <<'UZAK'
set -Eeuo pipefail
cd ~/apps/searxng
if ! grep -qE '^SEARXNG_SECRET=.+' .env 2>/dev/null; then
  umask 077
  echo "SEARXNG_SECRET=$(openssl rand -hex 32)" > .env
fi
docker compose up -d --remove-orphans
for i in $(seq 1 30); do
  curl -sf "http://100.111.242.24:8888/search?q=projelio&format=json" -o /dev/null && { echo "SearXNG hazır."; exit 0; }
  sleep 2
done
echo "UYARI: SearXNG 60 sn içinde JSON yanıtı vermedi. Günlük: docker logs projelio-searxng" >&2
exit 1
UZAK
