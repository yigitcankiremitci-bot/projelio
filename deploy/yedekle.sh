#!/usr/bin/env bash
# yedekle.sh — VPS'te günlük yedek alır (veritabanı + yüklenen dosyalar).
#
# NEDEN VAR: göçten sonra Supabase'in otomatik yedeği gitti ve bir süre tek
# kopyayla çalışıldı. Tek kopya, yedek değildir: yanlış bir migration, elle
# atılmış bir DELETE ya da diskin ölmesi geri dönüşü olmayan kayıp demekti.
#
# NE ALIYOR:
#   1. Postgres'in tamamı — pg_dump -Fc (custom format, pg_restore ile seçmeli
#      geri yükleme yapılabilir; düz SQL'e göre hem küçük hem esnek).
#   2. Yüklenen dosyalar — /srv/projelio/data/storage (kapak, avatar, ekler).
#      Veritabanı bunlara yalnızca yol tutuyor; dosyalar gidince kayıtlar
#      kırık bağlantıya dönüşür, o yüzden ikisi birlikte yedekleniyor.
#
# NE ALMIYOR: .env ve /etc/projelio altındaki sırlar. Onlar bilerek dışarıda —
# yedek dosyası sızarsa anahtarlar da sızmasın. Sırların ayrı bir kopyası
# olmalı (parola yöneticisi).
#
# Kurulum (VPS'te, bir kez):
#   sudo cp /srv/projelio/deploy/systemd/projelio-yedek.* /etc/systemd/system/
#   sudo systemctl daemon-reload
#   sudo systemctl enable --now projelio-yedek.timer
#   sudo systemctl start projelio-yedek.service   # ilk yedeği hemen al
#
# Geri yükleme (dikkat: hedef veriyi ezer):
#   docker exec -i projelio-postgres pg_restore -U "$POSTGRES_USER" \
#     -d "$POSTGRES_DB" --clean --if-exists < yedek.dump

set -Eeuo pipefail

KOK="/srv/projelio"
YEDEK="$KOK/yedek"
GUNLUK="$YEDEK/gunluk"
HAFTALIK="$YEDEK/haftalik"
DEPO="$KOK/data/storage"
KILIT="$YEDEK/.kilit"
GUNLUK_SAKLAMA=14   # gün
HAFTALIK_SAKLAMA=8  # hafta

mkdir -p "$GUNLUK" "$HAFTALIK"
chmod 700 "$YEDEK"

# Üst üste binmesin: yedek uzun sürerse bir sonraki tetikleme beklemesin, atlasın.
exec 9>"$KILIT"
flock -n 9 || { echo "Önceki yedek hâlâ sürüyor, bu tur atlandı."; exit 0; }

damga="$(date +%Y%m%d-%H%M)"
db_dosya="$GUNLUK/db-$damga.dump"
depo_dosya="$GUNLUK/depo-$damga.tar.gz"

# --- Disk kontrolü ------------------------------------------------------------
# Yedek alırken diski doldurup canlıyı durdurmak, yedeksiz kalmaktan beterdir.
bos_mb="$(df -Pm "$YEDEK" | awk 'NR==2 {print $4}')"
if [ "$bos_mb" -lt 2048 ]; then
  echo "HATA: $YEDEK için boş alan ${bos_mb}MB — 2GB altına inildi, yedek alınmadı." >&2
  exit 1
fi

# --- 1. Veritabanı ------------------------------------------------------------
# Önce geçici ada yazılıyor: yarım kalmış bir dump, geçerli bir yedek gibi
# durmasın. Doğrulama geçtikten sonra gerçek adına taşınıyor.
gecici="$db_dosya.yaziliyor"
docker exec projelio-postgres sh -c \
  'pg_dump -Fc --no-owner -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$gecici"

# Bütünlük kontrolü: pg_restore içindekileri listeleyebiliyorsa dosya okunur
# durumda demektir. Sessizce bozuk yedek, yedeksizlikten daha tehlikeli.
docker exec -i projelio-postgres pg_restore --list > /dev/null < "$gecici" \
  || { rm -f "$gecici"; echo "HATA: dump doğrulanamadı, atıldı." >&2; exit 1; }
mv "$gecici" "$db_dosya"

# --- 2. Yüklenen dosyalar -----------------------------------------------------
if [ -d "$DEPO" ]; then
  tar -czf "$depo_dosya.yaziliyor" -C "$(dirname "$DEPO")" "$(basename "$DEPO")"
  mv "$depo_dosya.yaziliyor" "$depo_dosya"
fi

chmod 600 "$GUNLUK"/*

# --- 3. Haftalık kopya --------------------------------------------------------
# Pazar günkü yedek ayrıca haftalığa kopyalanıyor: günlükler 14 günde
# dönerken, iki ay öncesine dönebilmek çoğu "ne zaman bozulmuş bu veri"
# sorusunda gereken şey.
if [ "$(date +%u)" = "7" ]; then
  cp -p "$db_dosya" "$HAFTALIK/"
  [ -f "$depo_dosya" ] && cp -p "$depo_dosya" "$HAFTALIK/"
fi

# --- 4. Eskiyenleri sil -------------------------------------------------------
find "$GUNLUK" -type f -mtime "+$GUNLUK_SAKLAMA" -delete
find "$HAFTALIK" -type f -mtime "+$((HAFTALIK_SAKLAMA * 7))" -delete

echo "Yedek tamam: $(basename "$db_dosya") ($(du -h "$db_dosya" | cut -f1))"
[ -f "$depo_dosya" ] && echo "            $(basename "$depo_dosya") ($(du -h "$depo_dosya" | cut -f1))"
echo "Toplam yedek alanı: $(du -sh "$YEDEK" | cut -f1)"
