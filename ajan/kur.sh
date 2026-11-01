#!/usr/bin/env bash
# Projelio ajanını bu Mac'e kurar: ayar dosyası + oturum açınca başlayan
# launchd görevi. Tekrar çalıştırmak güvenli (anahtarı günceller, yeniden başlatır).
#
#   bash ajan/kur.sh ajan_XXXXXXXX           # anahtar Projelio'daki ajan panelinden
#   bash ajan/kur.sh --kaldir                # görevi durdurur ve siler
set -euo pipefail

KLASOR="$HOME/.projelio-ajan"
AYAR="$KLASOR/ayar.env"
ETIKET="app.projelio.ajan"
PLIST="$HOME/Library/LaunchAgents/$ETIKET.plist"
KOD="$(cd "$(dirname "$0")" && pwd)/src/index.ts"

if [[ "${1:-}" == "--kaldir" ]]; then
  launchctl bootout "gui/$(id -u)/$ETIKET" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Ajan durduruldu ve kaldırıldı. Ayarlar $KLASOR içinde duruyor."
  exit 0
fi

ANAHTAR="${1:-}"
if [[ ! "$ANAHTAR" =~ ^ajan_ ]]; then
  echo "Kullanım: bash ajan/kur.sh ajan_XXXXXXXX   (anahtar Projelio > ajan paneli > Mac bağlantısı)" >&2
  exit 1
fi

NODE="$(command -v node || true)"
[[ -n "$NODE" ]] || { echo "node bulunamadı (Node 22.18+ gerekli)." >&2; exit 1; }
command -v ollama >/dev/null || { echo "Ollama kurulu değil: brew install ollama && brew services start ollama" >&2; exit 1; }

mkdir -p "$KLASOR"
chmod 700 "$KLASOR"
MODEL="$(grep -E '^AJAN_MODEL=' "$AYAR" 2>/dev/null | cut -d= -f2- || true)"
MODEL="${MODEL:-qwen3:8b}"
API="$(grep -E '^PROJELIO_API=' "$AYAR" 2>/dev/null | cut -d= -f2- || true)"
API="${API:-https://api.projelio.app}"
# Arama: VPS'teki SearXNG (deploy/searxng-kur.sh), yalnızca tailnet'te açık —
# bu Mac Tailscale'e bağlı değilse arama düşer, sayfa okuma yine çalışır.
SEARX="$(grep -E '^SEARXNG_URL=' "$AYAR" 2>/dev/null | cut -d= -f2- || true)"
SEARX="${SEARX:-http://100.111.242.24:8888}"
BRAVE="$(grep -E '^BRAVE_API_KEY=' "$AYAR" 2>/dev/null | cut -d= -f2- || true)"
# Anahtar yalnızca bu dosyada ve yalnızca sahibine okunur.
umask 077
cat > "$AYAR" <<EOF
PROJELIO_API=$API
AJAN_ANAHTARI=$ANAHTAR
AJAN_MODEL=$MODEL
OLLAMA_URL=http://127.0.0.1:11434
SEARXNG_URL=$SEARX
EOF
[[ -n "$BRAVE" ]] && echo "BRAVE_API_KEY=$BRAVE" >> "$AYAR"

ollama list | grep -q "^$MODEL" || ollama pull "$MODEL"

mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIKET</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$KOD</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>$KLASOR/ajan.log</string>
  <key>StandardErrorPath</key><string>$KLASOR/ajan.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$ETIKET" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Ajan çalışıyor. Günlük: tail -f $KLASOR/ajan.log"
