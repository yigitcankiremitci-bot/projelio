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
# NEREYE: yerelde $YEDEK altına, VE tanımlıysa uzak bir hedefe (bkz. adım 5,
# PROJELIO_UZAK_HEDEF). Yalnızca yerel kopya "yedek" sayılmaz: diskin ölmesi
# ya da sunucunun ele geçirilmesi senaryosunda ikisi birden gider.
# Yedeğin koştuğunu doğrulamak için yaşam sinyali de var (adım 6).
#
# KURULUM — iki yol var, ikisi de aynı betiği koşar:
#
#   A) root'suz (bugün geçerli olan): projelio kullanıcısının crontab'ı.
#      `projelio` sudoers'da DEĞİL ve bu makineden root SSH'ı yok, o yüzden
#      varsayılan yol budur.
#        ssh projelio@100.111.242.24
#        ( crontab -l 2>/dev/null | grep -v yedekle.sh; \
#          echo '30 3 * * * /srv/projelio/deploy/yedekle.sh >> $HOME/yedekleme.log 2>&1' \
#        ) | crontab -
#      Günlük dosyası ev dizinine yazılır, alt dizine DEĞİL: yönlendirme
#      betikten önce çalışır, dizin yoksa cron işi sessizce hiç koşmaz.
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

# Betik NEREDE düşerse düşsün haber verilsin.
#
# `set -e` yüzünden pg_dump'ın, doğrulamanın ya da disk kontrolünün başarısızlığı
# betiği ANINDA sonlandırıyor; aşağıdaki uyarı satırlarına hiç ulaşılmıyordu.
# ERR tuzağı bu erken çıkışları da yakalar. Tuzak yalnızca hata yolunda çalışır,
# normal akışı etkilemez.
hata_bildir() {
  kod=$?
  satir=${1:-?}
  UYAR="$(dirname "$0")/uyar.sh"
  [ -x "$UYAR" ] && "$UYAR" "YEDEK ALINAMADI" \
    "Betik $satir. satırda durdu (çıkış kodu $kod).
Sunucu yedeksiz kalmış olabilir — en son başarılı yedek: $(ls -t "${YEDEK:-/srv/projelio/yedek}/gunluk"/db-*.dump 2>/dev/null | head -1 | xargs -r basename || echo 'bulunamadı')" || true
  exit "$kod"
}
trap 'hata_bildir $LINENO' ERR

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

# --- 1b. WhatsApp oturum veritabanları ----------------------------------------
# WAHA oturum anahtarlarını ana veritabanında değil, "waha" ile başlayan ayrı
# veritabanlarında tutar (oturum başına bir tane açabiliyor; adı motora göre
# değişir, o yüzden ada değil önek'e bakıyoruz). Yukarıdaki pg_dump tek
# veritabanı alır, bunlar dışarıda kalırdı. Kaybı ölümcül değil — numara QR ile
# yeniden bağlanır — ama her felakette QR okutmak zorunda kalmamak için alınıyor.
# Boş liste (WhatsApp hiç kurulmadıysa) sessizce geçilir.
waha_dbler="$(docker exec projelio-postgres sh -c \
  'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select datname from pg_database where datname like '"'"'waha%'"'"' order by 1"' 2>/dev/null || true)"
for waha_db in $waha_dbler; do
  waha_dosya="$GUNLUK/$waha_db-$damga.dump"
  docker exec projelio-postgres sh -c \
    "pg_dump -Fc --no-owner -U \"\$POSTGRES_USER\" \"$waha_db\"" > "$waha_dosya.yaziliyor" \
    && mv "$waha_dosya.yaziliyor" "$waha_dosya" \
    || { rm -f "$waha_dosya.yaziliyor"; echo "UYARI: $waha_db yedeklenemedi, geçildi." >&2; }
done

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

# --- 5. DIŞ KOPYA -------------------------------------------------------------
# Buraya kadar alınan her şey HÂLÂ AYNI DİSKTE duruyor — yani korumaya
# çalıştığımız şeyin üzerinde. Bu betiğin başındaki gerekçe "diskin ölmesi"
# diyor ama o senaryoda yedekler de veriyle birlikte gidiyordu. Sunucu ele
# geçirilirse de yedekler saldırganla aynı makinede olurdu.
#
# Bu yüzden günlük dosyalar ayrıca uzak bir hedefe kopyalanır. rclone seçildi:
# tek ikili dosya, S3/B2/Drive/WebDAV hepsini konuşuyor ve kendi yapılandırma
# dosyasında şifreli remote (crypt) tanımlanabiliyor — yedek dışarı çıkarken
# şifreli olsun ki hedef sağlayıcı içeriği okuyamasın.
#
# KURULUM (bir kez, sunucuda):
#   1. rclone kur:            curl https://rclone.org/install.sh | sudo bash
#      (root yoksa: https://rclone.org/downloads/ ikilisini ~/bin altına koy)
#   2. Hedefi tanımla:        rclone config      → örn. "b2" veya "drive"
#   3. Şifreli katman ekle:   rclone config      → type=crypt, remote=b2:projelio-yedek
#   4. /etc/projelio/yedek.env ya da crontab'a ekle:
#        PROJELIO_UZAK_HEDEF=yedek-sifreli:projelio
#
# Değişken tanımlı değilse bu adım SESSİZCE atlanır: dış kopya kurulmamış bir
# sunucuda betiğin davranışı hiç değişmez.
if [ -n "${PROJELIO_UZAK_HEDEF:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    # Yalnızca günlük dizin gönderiliyor; haftalıklar zaten onun kopyası.
    # --immutable: uzakta var olan bir dosya bir daha yazılmaz (fidye yazılımının
    # yerelde bozduğu dosya uzaktakini ezemesin).
    # Saklama uzakta AYRICA ayarlanmalı (B2 lifecycle / S3 object lock); burada
    # silme yapılmıyor ki yerelde silinen bir şey uzaktan da silinmesin.
    if rclone copy "$GUNLUK" "$PROJELIO_UZAK_HEDEF/gunluk" \
         --immutable --transfers 2 --retries 3 --stats-one-line 2>&1; then
      echo "Dış kopya tamam: $PROJELIO_UZAK_HEDEF/gunluk"
    else
      # Dış kopya başarısızlığı yedek turunu düşürmez (yerel yedek alınmış
      # durumda) ama SESSİZ de kalmamalı: çıkış kodu 2 ile ayırt ediliyor.
      echo "HATA: dış kopya gönderilemedi ($PROJELIO_UZAK_HEDEF)." >&2
      uzak_hata=1
    fi
  else
    echo "HATA: PROJELIO_UZAK_HEDEF tanımlı ama rclone kurulu değil." >&2
    uzak_hata=1
  fi
else
  echo "UYARI: dış kopya kapalı (PROJELIO_UZAK_HEDEF tanımsız) — yedekler yalnızca bu diskte."
fi

echo "Yedek tamam: $(basename "$db_dosya") ($(du -h "$db_dosya" | cut -f1))"
[ -f "$depo_dosya" ] && echo "            $(basename "$depo_dosya") ($(du -h "$depo_dosya" | cut -f1))"
echo "Toplam yedek alanı: $(du -sh "$YEDEK" | cut -f1)"

# --- 6. YAŞAM SİNYALİ ---------------------------------------------------------
# "Yedek başarısız oldu"yu log'a yazmak yetmiyor: kimse log'a bakmıyor. Daha
# kötüsü, betik HİÇ ÇALIŞMADIYSA (cron silinmiş, sunucu kapalı) log'da da hiçbir
# şey olmuyor — sessizlik hem "her şey yolunda" hem "haftalardır yedek yok"
# anlamına geliyordu.
#
# Çözüm ters yönde çalışır: başarıda uzak bir adrese "yaşıyorum" isteği atılır.
# Beklenen sürede sinyal GELMEZSE karşı taraf uyarı gönderir. Böylece hem hata
# hem de hiç çalışmama durumu yakalanır.
#
# KURULUM: healthchecks.io (ücretsiz) üzerinde bir kontrol oluştur, verdiği
# adresi PROJELIO_YEDEK_PING olarak tanımla. Tanımsızsa bu adım atlanır.
if [ -n "${PROJELIO_YEDEK_PING:-}" ]; then
  ping_adres="$PROJELIO_YEDEK_PING"
  [ -n "${uzak_hata:-}" ] && ping_adres="$PROJELIO_YEDEK_PING/fail"
  curl -fsS -m 10 --retry 3 -o /dev/null "$ping_adres" \
    || echo "UYARI: yedek yaşam sinyali gönderilemedi." >&2
fi

# Dış kopya düştüyse tur "kısmen başarılı": yerel yedek var ama koruma eksik.
# Çıkış kodu 0 DEĞİL ki systemd OnFailure / cron çıktısı bunu fark etsin.
# Ayrıca doğrudan haber verilir: bu sunucuda iş crontab'la koşuyor (root yok),
# yani systemd OnFailure devrede değil ve sessiz kalırdı.
if [ -n "${uzak_hata:-}" ]; then
  UYAR="$(dirname "$0")/uyar.sh"
  [ -x "$UYAR" ] && "$UYAR" "Yedek dış kopyası gönderilemedi" \
    "Yerel yedek alındı ($YEDEK) ama uzak hedefe kopyalanamadı.
Hedef: ${PROJELIO_UZAK_HEDEF:-tanımsız}
Yedekler şu an YALNIZCA bu diskte duruyor." || true
  exit 2
fi
exit 0
