#!/usr/bin/env bash
# yerel-canliya-bagla.sh — yerel geliştirmeyi CANLI veritabanına bağlar/ayırır.
#
# NE YAPIYOR: backend/.env içindeki iki satırı değiştiriyor —
#   SUPABASE_URL              -> https://api.projelio.app  (VPS)
#   SUPABASE_SERVICE_ROLE_KEY -> VPS'in kendi anahtarı
# Anahtar sunucudan alınıp doğrudan dosyaya yazılır; ekrana BASILMAZ.
#
# NEDEN GEREKLİ: yerel .env eski Supabase projesini gösteriyordu. Oradaki veri
# 30 Ağustos'ta donmuş bir kopya ve VPS'e uygulanan migration'lar orada yok —
# yeni modüller yerelde görünmüyor.
#
# DİKKAT: bağlandıktan sonra `npm run dev` ile yaptığın her kayıt, silme ve
# düzenleme GERÇEK veriye gider. Geri alma yolu yedekten dönmektir
# (~/Projelio-yedek, her gün 14:00). Bu yüzden backend açılışta kırmızı bir
# uyarı basıyor (bkz. backend/src/main.ts).
#
# Kullanım:
#   ./deploy/yerel-canliya-bagla.sh          # canlıya bağla
#   ./deploy/yerel-canliya-bagla.sh --geri   # eski ayara dön

set -Eeuo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ENV="backend/.env"
SUNUCU="projelio@100.111.242.24"
UZAK_ENV="/srv/projelio/deploy/.env"
YEDEK="backend/.env.yedek-yerel"

[ -f "$ENV" ] || { echo "✗ $ENV bulunamadı." >&2; exit 1; }

if [ "${1:-}" = "--geri" ]; then
  [ -f "$YEDEK" ] || { echo "✗ Geri dönülecek yedek yok ($YEDEK)." >&2; exit 1; }
  cp "$YEDEK" "$ENV"
  echo "✓ Eski ayarlara dönüldü. Backend'i yeniden başlat (npm run dev)."
  exit 0
fi

# Bir kez yedeklenir: ikinci çalıştırma "canlı" hâlini yedek sanıp geri dönüşü
# bozmasın.
[ -f "$YEDEK" ] || cp "$ENV" "$YEDEK"

echo "Sunucudan anahtar alınıyor…"
anahtar="$(ssh -i "$HOME/.ssh/id_ed25519" -o BatchMode=yes -o ConnectTimeout=20 "$SUNUCU" \
  "grep -m1 '^SUPABASE_SERVICE_ROLE_KEY=' $UZAK_ENV | cut -d= -f2-")"
[ -n "$anahtar" ] || { echo "✗ Anahtar okunamadı." >&2; exit 1; }

# sed yerine python: anahtar içinde / veya & geçerse sed bozulur.
ENV="$ENV" ANAHTAR="$anahtar" python3 - <<'PY'
import os, re
yol = os.environ["ENV"]
anahtar = os.environ["ANAHTAR"].strip()
s = open(yol).read()

def ayarla(metin, ad, deger):
    satir = f"{ad}={deger}"
    if re.search(rf"(?m)^{ad}=.*$", metin):
        return re.sub(rf"(?m)^{ad}=.*$", satir, metin, count=1)
    return metin.rstrip("\n") + "\n" + satir + "\n"

s = ayarla(s, "SUPABASE_URL", "https://api.projelio.app")
s = ayarla(s, "SUPABASE_SERVICE_ROLE_KEY", anahtar)
open(yol, "w").write(s)
PY

echo "✓ Yerel backend artık CANLI veritabanına bağlı."
echo "  Yaptığın her değişiklik gerçek veriye gider. Geri dönmek için:"
echo "    ./deploy/yerel-canliya-bagla.sh --geri"
