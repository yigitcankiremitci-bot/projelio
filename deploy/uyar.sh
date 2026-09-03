#!/usr/bin/env bash
# uyar.sh — bir şey bozulduğunda haber verir.
#
# NEDEN VAR: bu sunucuda hiçbir arıza kimseye ulaşmıyordu. Dağıtım başarısız
# olduğunda hata journal'a yazılıyor, yedek başarısız olduğunda log dosyasına
# yazılıyor — ikisine de kimse bakmıyor. 2026-09-03'te dağıtım tam olarak böyle
# sessizce döngüye girdi: zamanlayıcı her dakika yeniden denedi, canlı eski
# hâlinde kaldı ve durum ancak elle bakıldığında fark edildi.
#
# NASIL KULLANILIR:
#   ./uyar.sh "Başlık" "Ayrıntı metni"
#
# Hiçbir kanal yapılandırılmamışsa çıktıyı stderr'e yazar ve BAŞARIYLA çıkar:
# uyarı gönderememek, uyarıyı tetikleyen işi ayrıca düşürmemeli.
#
# KANALLAR (ikisi de isteğe bağlı, ikisi birden tanımlanabilir):
#
#   PROJELIO_NTFY_KONU     ntfy.sh konusu. Kurulum: telefona ntfy uygulamasını
#                          kur, rastgele bir konu adı seç (tahmin edilemesin —
#                          konuya abone olan herkes mesajları görür), ör:
#                            PROJELIO_NTFY_KONU=projelio-a7f3c9
#                          Kendi sunucun varsa: PROJELIO_NTFY_SUNUCU=https://...
#
#   PROJELIO_TELEGRAM_TOKEN + PROJELIO_TELEGRAM_CHAT
#                          @BotFather'dan bot oluştur, tokenı ve sohbet
#                          kimliğini ver.
#
# Değişkenler /etc/projelio/uyari.env ya da kullanıcının ortamından okunur.
# systemd birimlerinde EnvironmentFile= ile, crontab'da ise betiğin başında
# `set -a; . ~/uyari.env; set +a` ile yüklenebilir.

set -uo pipefail

BASLIK="${1:-Projelio uyarısı}"
AYRINTI="${2:-}"
SUNUCU_ADI="$(hostname 2>/dev/null || echo bilinmeyen)"

# Ortak ayar dosyası varsa yüklenir (systemd'siz kurulumda tek yol bu).
for aday in /etc/projelio/uyari.env "$HOME/uyari.env"; do
  if [ -r "$aday" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$aday"
    set +a
    break
  fi
done

METIN="$BASLIK
Sunucu: $SUNUCU_ADI
Zaman: $(date '+%Y-%m-%d %H:%M:%S %Z')"
[ -n "$AYRINTI" ] && METIN="$METIN

$AYRINTI"

gonderildi=0

if [ -n "${PROJELIO_NTFY_KONU:-}" ]; then
  ntfy_sunucu="${PROJELIO_NTFY_SUNUCU:-https://ntfy.sh}"
  if curl -fsS -m 10 --retry 2 \
       -H "Title: Projelio · $BASLIK" \
       -H "Priority: high" \
       -H "Tags: warning" \
       -d "$METIN" \
       "$ntfy_sunucu/$PROJELIO_NTFY_KONU" >/dev/null 2>&1; then
    gonderildi=1
  else
    echo "uyar.sh: ntfy gönderilemedi." >&2
  fi
fi

if [ -n "${PROJELIO_TELEGRAM_TOKEN:-}" ] && [ -n "${PROJELIO_TELEGRAM_CHAT:-}" ]; then
  if curl -fsS -m 10 --retry 2 \
       --data-urlencode "chat_id=$PROJELIO_TELEGRAM_CHAT" \
       --data-urlencode "text=$METIN" \
       "https://api.telegram.org/bot$PROJELIO_TELEGRAM_TOKEN/sendMessage" >/dev/null 2>&1; then
    gonderildi=1
  else
    echo "uyar.sh: Telegram gönderilemedi." >&2
  fi
fi

if [ "$gonderildi" = "0" ]; then
  # Kanal yok ya da hepsi düştü: en azından journal'a/loga düşsün.
  echo "UYARI (kanal yapılandırılmamış): $METIN" >&2
fi

exit 0
