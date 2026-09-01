#!/usr/bin/env bash
# yedek-getir.sh — VPS'teki en yeni yedeği bu makineye indirir.
#
# NEDEN: aynı diskteki yedek, yedek sayılmaz. Disk ölürse ya da sunucu
# kaybolursa ikisi birden gider. Bu betik "sunucu dışı kopya" ayağıdır;
# haftada bir çalıştırmak bile durumu bambaşka yapar.
#
# Kullanım:
#   ./deploy/yedek-getir.sh              # ~/Projelio-yedek altına indirir
#   ./deploy/yedek-getir.sh /baska/yol

set -Eeuo pipefail

SUNUCU="projelio@100.111.242.24"   # tailnet; genel IP'de 22 kapalı
# Betik yedeği /srv/projelio/yedek'e yazamazsa ~/yedek'e düşüyor; ikisine de
# bakıyoruz ki kurulumun hangi yolla yapıldığını bilmek gerekmesin.
UZAK_ADAYLAR="/srv/projelio/yedek/gunluk \$HOME/yedek/gunluk"
HEDEF="${1:-$HOME/Projelio-yedek}"

mkdir -p "$HEDEF"

son_db="$(ssh "$SUNUCU" "ls -t $UZAK_ADAYLAR/db-*.dump 2>/dev/null | head -1")"
[ -n "$son_db" ] || { echo "Sunucuda yedek bulunamadı — crontab/timer kurulu mu?" >&2; exit 1; }
son_depo="$(ssh "$SUNUCU" "ls -t $UZAK_ADAYLAR/depo-*.tar.gz 2>/dev/null | head -1" || true)"

echo "İndiriliyor: $(basename "$son_db")"
scp "$SUNUCU:$son_db" "$HEDEF/"
if [ -n "$son_depo" ]; then
  echo "İndiriliyor: $(basename "$son_depo")"
  scp "$SUNUCU:$son_depo" "$HEDEF/"
fi

echo "Bitti → $HEDEF"
ls -lh "$HEDEF" | tail -5
