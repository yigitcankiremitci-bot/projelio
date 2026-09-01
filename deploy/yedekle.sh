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
# KURULUM — iki yol var, ikisi de aynı betiği koşar:
#
#   A) root'suz (bugün geçerli olan): projelio kullanıcısının crontab'ı.
#      `projelio` sudoers'da DEĞİL ve bu makineden root SSH'ı yok, o yüzden
#      varsayılan yol budur.
#        ssh projelio@100.111.242.24
#        ( crontab -l 2>/dev/null | grep -v yedekle.sh; \
#          echo '30 3 * * * /srv/projelio/deploy/yedekle.sh >> $HOME/yedek/son.log 2>&1' \
#        ) | crontab -
#        /srv/projelio/deploy/yedekle.sh        # ilk yedeği hemen al
#
#   B) root varsa: systemd birimi daha iyidir (journal'a yazar, Persistent=true
#      ile kaçırılan günü telafi eder).
#        cp /srv/projelio/deploy/systemd/projelio-yedek.* /etc/systemd/system/
#        systemctl daemon-reload && systemctl enable --now projelio-yedek.timer
#
# Geri yükleme (dikkat: hedef veriyi ezer):
#   docker exec -i projelio-postgres pg_restore -U "$POSTGRES_USER" \
#     -d "$POSTGRES_DB" --clean --if-exists < yedek.dump

set -Eeuo pipefail

KOK="/srv/projelio"
DEPO="$KOK/data/storage"
GUNLUK_SAKLAMA=14   # gün
HAFTALIK_SAKLAMA=8  # hafta

# Yedek nereye yazılacak: /srv/projelio root'un, uygulama kullanıcısı oraya
# yazamayabilir. Sırayla denenir; ilk yazılabilen kazanır. Böylece betik hem
# root'lu systemd biriminde hem de projelio'nun crontab'ında aynı şekilde
# çalışıyor — kurulum yolunu değiştirmek betiği değiştirmeyi gerektirmiyor.
YEDEK="${PROJELIO_YEDEK:-}"
if [ -z "$YEDEK" ]; then
  if mkdir -p "$KOK/yedek" 2>/dev/null; then YEDEK="$KOK/yedek"; else YEDEK="$HOME/yedek"; fi
fi
GUNLUK="$YEDEK/gunluk"
HAFTALIK="$YEDEK/haftalik"
KILIT="$YEDEK/.kilit"

mkdir -p "$GUNLUK" "$HAFTALIK"
chmod 700 "$YEDEK"
echo "Yedek dizini: $YEDEK"

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
# Dosyalar host'ta root'un olabilir (bind mount'u konteyner oluşturuyor).
# Okuyamıyorsak konteynerin içinden alıyoruz — docker erişimi zaten var,
# root gerekmiyor.
if [ -r "$DEPO" ] && [ -d "$DEPO" ]; then
  tar -czf "$depo_dosya.yaziliyor" -C "$(dirname "$DEPO")" "$(basename "$DEPO")"
  mv "$depo_dosya.yaziliyor" "$depo_dosya"
elif docker inspect projelio-storage >/dev/null 2>&1; then
  docker exec projelio-storage tar -czf - -C /var/lib storage > "$depo_dosya.yaziliyor"
  mv "$depo_dosya.yaziliyor" "$depo_dosya"
else
  echo "UYARI: yüklenen dosyalar yedeklenemedi (ne $DEPO okunabiliyor ne de storage konteyneri ayakta)." >&2
fi

chmod 600 "$GUNLUK"/* 2>/dev/null || true

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
