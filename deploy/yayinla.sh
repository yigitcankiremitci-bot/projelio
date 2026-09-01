#!/usr/bin/env bash
# yayinla.sh — "yerelde çalış, hazır olunca yayına ver"
#
# Bu repoda YAYIN TETİĞİ TEK ŞEYDİR: main dalının origin'e push'lanması.
# Yerelde ne yaparsan yap — dosya kaydetmek, commit atmak, dal açmak — canlıya
# hiçbir şey gitmez. Bu betik o tek adımı bilerek zorlaştırır: push'tan ÖNCE
# CI'ın koşacağı kontrolleri yerelde koşar, ne gideceğini gösterir, onay ister.
#
# Sebep: CI kırmızı olduğunda hiçbir yerde hata görünmüyor — VPS'teki
# zamanlayıcı sessizce hiçbir şey yapmıyor (bkz. cicd-deploy.sh). Yani kırmızı
# bir push, "yayınladım" sanıp beklemekle geçen yarım saat demek. Kontrolleri
# önden koşmak o yarım saati satın alıyor.
#
# Kullanım:
#   npm run yayinla            # kontrol et, sor, push'la, sonucu izle
#   npm run yayinla -- -y      # onay sorma
#   npm run yayinla -- --hizli # testleri atla (yalnızca acil düzeltmede)

set -Eeuo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ONAYSIZ=0
HIZLI=0
for arg in "$@"; do
  case "$arg" in
    -y|--evet) ONAYSIZ=1 ;;
    --hizli) HIZLI=1 ;;
    *) echo "Bilinmeyen seçenek: $arg" >&2; exit 2 ;;
  esac
done

vazgec() { echo "✗ $1" >&2; exit 1; }

# 1. Doğru daldayız ve ağaç temiz mi -----------------------------------------
dal="$(git rev-parse --abbrev-ref HEAD)"
[ "$dal" = "main" ] || vazgec "main dalında değilsin ($dal). Yayın yalnızca main'den yapılır."

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit'lenmemiş değişiklikler var — bunlar YAYINA GİTMEZ:"
  git status --short
  echo
  vazgec "Önce commit'le, sonra yayınla."
fi

# 2. origin'den geri değiliz ---------------------------------------------------
git fetch --quiet origin main
if [ "$(git rev-list --count HEAD..origin/main)" != "0" ]; then
  vazgec "origin/main sende olmayan commit taşıyor. Önce 'git pull --ff-only'."
fi

gidecek="$(git log --oneline origin/main..HEAD)"
[ -n "$gidecek" ] || { echo "Yayınlanacak yeni bir şey yok — origin/main zaten güncel."; exit 0; }

echo "Yayınlanacak commit'ler:"
echo "$gidecek" | sed 's/^/  /'
echo

# 3. CI'ın koşacaklarını yerelde koş -------------------------------------------
# Buradaki iki komut ci.yml'deki ilk iki kontrolün aynısı. Docker imajları ve
# landing derlemesi bilerek koşulmuyor: yerelde dakikalar sürüyor, kırılma
# oranı ise çok düşük.
if [ "$HIZLI" = "1" ]; then
  echo "⚠ Testler atlandı (--hizli). CI yine de koşacak; kırmızı gelirse yayın olmaz."
else
  echo "→ npm run typecheck"
  npm run typecheck --silent || vazgec "typecheck kırmızı. CI de kırmızı olurdu, push edilmedi."
  echo "→ npm test"
  npm test --silent > /tmp/projelio-yayinla-test.log 2>&1 \
    || { tail -30 /tmp/projelio-yayinla-test.log; vazgec "testler kırmızı. Push edilmedi."; }
  echo "✓ typecheck ve testler yeşil"
fi

# 4. Onay ----------------------------------------------------------------------
if [ "$ONAYSIZ" = "0" ]; then
  printf "Canlıya (app.projelio.app) gitsin mi? [e/H] "
  read -r cevap
  case "$cevap" in
    e|E|evet|Evet) ;;
    *) echo "Vazgeçildi. Hiçbir şey push edilmedi."; exit 0 ;;
  esac
fi

# 5. Push ----------------------------------------------------------------------
git push origin main
sha="$(git rev-parse HEAD)"
echo

# 6. İzle: önce CI, sonra canlı derleme ----------------------------------------
# Buradan sonrası yalnızca izlemedir; Ctrl+C ile çıkmak yayını iptal etmez,
# zincir sunucuda kendi başına ilerler.
echo "CI bekleniyor (Ctrl+C güvenli, yayını durdurmaz)…"
api="https://api.github.com/repos/yigitcankiremitci-bot/projelio/actions/workflows/ci.yml/runs?branch=main&per_page=5"
sonuc=""
for _ in $(seq 1 90); do
  sonuc="$(curl -fsS --max-time 15 "$api" 2>/dev/null | python3 -c "
import json,sys
sha='$sha'
try: runs=json.load(sys.stdin)['workflow_runs']
except Exception: raise SystemExit
for r in runs:
    if r['head_sha']==sha:
        print(r['conclusion'] or r['status']); break
" || true)"
  case "$sonuc" in
    success) echo "✓ CI yeşil"; break ;;
    failure|cancelled|timed_out) vazgec "CI $sonuc — canlı DEĞİŞMEDİ. Ayrıntı: github.com/yigitcankiremitci-bot/projelio/actions" ;;
  esac
  sleep 10
done
[ "$sonuc" = "success" ] || vazgec "CI 15 dakikada bitmedi; Actions sayfasına bak."

# Canlıdaki giriş paketinin adı her derlemede değişir — dağıtımın gerçekten
# yayına çıktığını anlamanın dışarıdan tek yolu bu.
onceki="$(curl -fsS --max-time 15 https://app.projelio.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
echo "Dağıtım bekleniyor (VPS dakikada bir bakıyor)…"
for _ in $(seq 1 60); do
  sleep 15
  simdi="$(curl -fsS --max-time 15 https://app.projelio.app/ | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
  if [ -n "$simdi" ] && [ "$simdi" != "$onceki" ]; then
    echo "✓ Yayında: $onceki → $simdi"
    echo "  Tarayıcıda eski paket önbellekte kalmış olabilir: Cmd+Shift+R."
    exit 0
  fi
done
echo "⚠ 15 dakikada yeni paket görünmedi. CI yeşildi, yani sorun dağıtım tarafında:"
echo "  ssh projelio@100.111.242.24 'journalctl -u projelio-deploy -n 50 --no-pager'"
