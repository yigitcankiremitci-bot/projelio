#!/usr/bin/env bash
# yedek-al-mac.sh — Mac'ten VPS'in veritabanı yedeğini alır.
#
# NEDEN SUNUCUDA DEĞİL DE BURADA: sunucuda root yok (projelio sudoers'da değil),
# systemd birimi kurulamıyor; ayrıca aynı diskteki yedek zaten yedek sayılmaz.
# Yedeği Mac'in çekmesi iki sorunu birden çözüyor — kurulum root istemiyor ve
# kopya baştan sunucu dışında oluyor.
#
# Günde bir kez launchd çalıştırır (com.projelio.yedek). Mac kapalıysa o gün
# atlanır, açılınca ilk fırsatta koşar.

set -Eeuo pipefail

HEDEF="$HOME/Projelio-yedek"
SUNUCU="projelio@100.111.242.24"   # tailnet adresi; genel IP'de SSH kapalı
ANAHTAR="$HOME/.ssh/id_ed25519"
SAKLAMA=14                          # gün

SSH=(ssh -i "$ANAHTAR" -o BatchMode=yes -o ConnectTimeout=20)

mkdir -p "$HEDEF"
damga="$(date +%Y%m%d-%H%M)"
gecici="$HEDEF/.yaziliyor-$damga.dump"

# Dump doğrudan konteynerin içinden alınıyor; parola hiçbir yerde görünmüyor,
# compose'un kendi değişkenleri kullanılıyor.
"${SSH[@]}" "$SUNUCU" \
  'docker exec projelio-postgres sh -c "pg_dump -Fc --no-owner -U \$POSTGRES_USER \$POSTGRES_DB"' \
  > "$gecici"

# Yarım veya bozuk dosya geçerli bir yedek gibi durmasın: pg_restore dosyayı
# okuyabiliyorsa sağlamdır. Ancak ondan sonra gerçek adını alıyor.
"${SSH[@]}" "$SUNUCU" 'docker exec -i projelio-postgres pg_restore --list' < "$gecici" > /dev/null

mv "$gecici" "$HEDEF/db-$damga.dump"

# --- Yüklenen dosyalar --------------------------------------------------------
# Kapaklar, avatarlar, ekler. Veritabanı bunlara yalnızca YOL tutuyor; dosyalar
# giderse kayıtlar kırık bağlantıya döner. O yüzden ikisi birlikte alınıyor.
#
# tar konteynerin içinde çalışıyor (dosyalar host'ta root'un), sıkıştırma ise
# burada: konteynerde gzip olmayabilir, Mac'te her zaman var.
depo_gecici="$HEDEF/.yaziliyor-$damga.tar.gz"
if "${SSH[@]}" "$SUNUCU" 'docker exec projelio-storage tar -cf - -C /var/lib storage' \
     2>/dev/null | gzip > "$depo_gecici" && [ -s "$depo_gecici" ] \
     && tar -tzf "$depo_gecici" > /dev/null 2>&1; then
  mv "$depo_gecici" "$HEDEF/dosyalar-$damga.tar.gz"
  depo_satir=" · dosyalar-$damga.tar.gz ($(du -h "$HEDEF/dosyalar-$damga.tar.gz" | cut -f1))"
else
  rm -f "$depo_gecici"
  depo_satir=" · UYARI: yüklenen dosyalar alınamadı"
fi

# Eskiyenleri temizle (yarım kalmışları da).
find "$HEDEF" -name 'db-*.dump' -mtime "+$SAKLAMA" -delete
find "$HEDEF" -name 'dosyalar-*.tar.gz' -mtime "+$SAKLAMA" -delete
find "$HEDEF" -name '.yaziliyor-*' -mtime +1 -delete

echo "$(date '+%Y-%m-%d %H:%M')  yedek tamam: db-$damga.dump ($(du -h "$HEDEF/db-$damga.dump" | cut -f1))$depo_satir"
