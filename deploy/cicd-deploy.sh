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

# Her adım "|| return 1" ile: fonksiyon `if deploy_and_check` içinde çağrıldığı
# için bash burada set -e'yi YOK SAYAR — yalnızca son komutun sonucu sayılır.
# 2026-09-02'de `compose up` imaj çekemeyip düştü, sonraki sağlık kontrolleri
# eski konteynerlerde geçti ve dağıtım "başarılı" yazıldı; canlı eski hâlinde
# kaldı, kimse hata görmedi.
deploy_and_check() {
  docker compose -f "$COMPOSE" config --quiet || return 1
  docker compose -f "$COMPOSE" build backend caddy landing || return 1
  docker compose -f "$COMPOSE" up -d --remove-orphans || return 1
  docker compose -f "$COMPOSE" ps --status running --services | grep -qx backend || return 1
  docker compose -f "$COMPOSE" ps --status running --services | grep -qx landing || return 1
  # SAĞLIK KONTROLLERİ TLS'E BAĞLI DEĞİL — bilerek.
  # İlk dağıtımda Let's Encrypt sertifikası henüz alınmamış olur; geçerli
  # sertifika şartı koşan bir kontrol o dağıtımı başarısız sayar, betik de
  # önceki commit'e geri döner. Sonuç: sertifika hiçbir zaman alınamaz, çünkü
  # onu alacak sürüm hiçbir zaman ayakta kalamaz. Bu yüzden hepsi düz HTTP
  # üzerinden, Host başlığıyla yapılıyor.

  # Caddy ayakta ve alan adını tanıyor mu. Beklenen yanıt 308 (https'e
  # yönlendirme); curl --fail yalnızca 4xx/5xx'te düşer, 3xx başarıdır.
  curl --fail --silent --show-error --retry 12 --retry-delay 5     --retry-connrefused -H 'Host: app.projelio.app' http://127.0.0.1/ >/dev/null || return 1

  # Yönlendirme cevabı statik dosyaların yerinde olduğunu KANITLAMAZ; imajın
  # içinde gerçekten derlenmiş bir arayüz var mı, ayrıca bakılıyor.
  docker compose -f "$COMPOSE" exec -T caddy test -f /srv/web/index.html || return 1

  # Backend: iç ağ bloğundan (http://caddy), sertifikadan bağımsız.
  curl --fail --silent --show-error --retry 12 --retry-delay 5     --retry-connrefused -H 'Host: caddy' http://127.0.0.1/health >/dev/null || return 1

  curl --fail --silent --show-error --retry 12 --retry-delay 5     --retry-connrefused http://127.0.0.1:3001/ >/dev/null || return 1
}

# Eski imajların temizliği BAŞARIDAN BAĞIMSIZ yapılır.
# Önceden yalnızca başarılı dağıtımda çalışıyordu; üst üste başarısız dağıtımlar
# imaj biriktirip diski dolduruyordu. Dolu disk yalnızca dağıtımı değil YEDEĞİ de
# durdurur (bkz. yedekle.sh'taki 2 GB kontrolü) — yani başarısız dağıtım zinciri
# sessizce "yedeksiz kaldık" durumuna götürebiliyordu.
temizle() { docker image prune -f --filter 'until=168h' >/dev/null 2>&1 || true; }

# Uygulanmamış migration var mı?
#
# NEDEN BURADA: kod otomatik dağıtılıyor ama ŞEMA dağıtılmıyor — migration'lar
# hâlâ elle uygulanıyor. Yeni bir kolona bakan backend sürümü canlıya çıkıp
# migration unutulursa uygulama çalışma anında patlıyor ve dağıtımın sağlık
# kontrolü bunu YAKALAYAMIYOR (yalnızca /health'e bakıyor, o da veritabanına
# bakmıyordu). Bu kontrol boşluğu kapatır.
#
# Dağıtımı DURDURMAZ: migration'ların çoğu geriye dönük uyumlu ve dağıtımı
# bloke etmek daha büyük zarar verirdi. Yalnızca haber verir.
migration_uyarisi() {
  local kayit bekleyen
  kayit="$(docker exec -i "$KONTEYNER_PG" sh -c \
    'psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select to_regclass('"'"'public.schema_migrations'"'"') is not null"' \
    2>/dev/null | tr -d '[:space:]')" || return 0
  # Tablo henüz yoksa (083 uygulanmadıysa) bu kontrol sessizce atlanır.
  [ "$kayit" = "t" ] || return 0

  bekleyen="$(docker exec -i "$KONTEYNER_PG" sh -c \
    'psql -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from public.schema_migrations"' \
    2>/dev/null | tr -d '[:space:]')" || return 0
  local dosya_sayisi
  dosya_sayisi="$(ls "$ROOT/database/migrations"/*.sql 2>/dev/null | wc -l | tr -d ' ')"

  if [ -n "$bekleyen" ] && [ "$dosya_sayisi" -gt "$bekleyen" ]; then
    echo "UYARI: $((dosya_sayisi - bekleyen)) migration uygulanmamış görünüyor." >&2
    [ -x "$UYAR_BETIK" ] && "$UYAR_BETIK" "Uygulanmamış migration var" \
      "Repoda $dosya_sayisi migration var, canlıda $bekleyen kayıtlı.
Dağıtım tamamlandı ama şema geride olabilir.
Kontrol: ./deploy/migrate.sh durum" || true
  fi
}

KONTEYNER_PG="projelio-postgres"
UYAR_BETIK="$(dirname "$0")/uyar.sh"

sync_source
if deploy_and_check; then
  printf '%s\n' "$candidate" >"$STATE"
  temizle
  migration_uyarisi || true
  exit 0
fi

echo "Deploy başarısız; önceki commit geri yükleniyor." >&2
geri_dondu="hayır"
if [[ "$previous" =~ ^[0-9a-f]{40}$ ]]; then
  git -C "$SOURCE" checkout --quiet --detach "$previous"
  sync_source
  if deploy_and_check; then geri_dondu="evet"; fi
fi
temizle

# Haber ver: systemd OnFailure yalnızca root'lu kurulumda çalışıyor, bu sunucuda
# iş crontab'la koşuyor (bkz. yedekle.sh başlığı). Uyarı burada da tetiklenmezse
# hata yine sessiz kalırdı — zamanlayıcı her dakika yeniden deneyip döngüye girer.
[ -x "$UYAR_BETIK" ] && "$UYAR_BETIK" "Dağıtım başarısız" \
  "Commit: $candidate
Önceki sürüme dönüldü: $geri_dondu
Ayrıntı: journalctl -u projelio-deploy -n 50" || true

exit 1
