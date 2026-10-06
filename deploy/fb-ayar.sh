#!/usr/bin/env bash
# fb-ayar.sh — rakip/hashtag takibinin Facebook ayarlarını canlı sunucunun
# backend .env dosyasına ekler (bkz. docs/moduller/14-instagram-entegrasyonu.md §10).
#
# NEDEN BETİK: dört satırı elle eklemek uzun komutları sunucuda doğru
# yapıştırmayı gerektiriyordu. Bu betik YERELDEN çalışır:
#   · App Secret'ı ekranda göstermeden sorar (komut geçmişine de düşmez)
#   · değerleri ssh'nin standart girdisinden gönderir (komut satırında görünmez)
#   · önce .env'in yedeğini alır, zaten olan anahtarı ikinci kez eklemez
#
# Kullanım (Mac terminalinde, proje klasöründe):
#   bash deploy/fb-ayar.sh           eksik ayarları ekler
#   bash deploy/fb-ayar.sh --yenile  App Secret'ı yenisiyle DEĞİŞTİRİR
set -euo pipefail

YENILE=0
[[ "${1:-}" == "--yenile" ]] && YENILE=1

SUNUCU="${PROJELIO_SUNUCU:-projelio@100.111.242.24}"
ENV_YOLU="/srv/projelio/deploy/.env"

APP_ID="2135126103737690"
CONFIG_ID="1388698933295365"
EPOSTA="yigitcankiremitci@gmail.com"

echo "Meta panelinden kopyaladığın App Secret'ı yapıştırıp Enter'a bas."
echo "(Yazarken ekranda hiçbir şey görünmez, bu normal.)"
read -rs -p "App Secret: " SECRET
echo
SECRET="$(printf '%s' "$SECRET" | tr -d '[:space:]')"
if [[ -z "$SECRET" ]]; then
  echo "Boş bırakıldı, hiçbir şey değiştirilmedi."
  exit 1
fi
# Yapıştırma iki kez olduysa (aynı dizi art arda) tek kopyası alınır —
# 2026-10-06'da tam olarak bu oldu ve anahtar 64 karakter yazılmıştı.
yari=$(( ${#SECRET} / 2 ))
if (( ${#SECRET} % 2 == 0 )) && [[ "${SECRET:0:yari}" == "${SECRET:yari}" ]]; then
  SECRET="${SECRET:0:yari}"
  echo "Anahtar iki kez yapıştırılmış görünüyor; tek kopyası kullanılıyor."
fi
if [[ ! "$SECRET" =~ ^[0-9a-f]{32}$ ]]; then
  echo "Uyarı: Facebook App Secret genelde 32 karakterlik küçük harf/rakam dizisidir (girilen: ${#SECRET} karakter)."
  read -r -p "Yine de kaydedilsin mi? [e/H] " cevap
  [[ "$cevap" == "e" || "$cevap" == "E" ]] || { echo "Vazgeçildi, hiçbir şey değiştirilmedi."; exit 1; }
fi

# Değerler stdin'den gider; sunucu tarafı yalnızca eksik anahtarları ekler.
printf 'FACEBOOK_APP_ID=%s\nFACEBOOK_APP_SECRET=%s\nFACEBOOK_LOGIN_CONFIG_ID=%s\nRAKIP_TAKIP_EPOSTALARI=%s\n' \
  "$APP_ID" "$SECRET" "$CONFIG_ID" "$EPOSTA" |
  ssh "$SUNUCU" "set -e
    cp -p '$ENV_YOLU' ~/env-yedek-\$(date +%Y%m%d-%H%M%S)
    eklenen=0
    while IFS= read -r satir; do
      anahtar=\${satir%%=*}
      if [ $YENILE = 1 ] && [ \"\$anahtar\" = FACEBOOK_APP_SECRET ]; then
        # Eski satır silinip yenisi eklenir (sed'e değer verilmez: gizli
        # anahtardaki bir karakter ifadeyi bozabilirdi).
        # Geçici dosya ev klasöründe: deploy klasörüne bu kullanıcı yazamıyor.
        gecici=\$HOME/.fb-ayar.tmp
        grep -v '^FACEBOOK_APP_SECRET=' '$ENV_YOLU' > \"\$gecici\" || true
        printf '%s\\n' \"\$satir\" >> \"\$gecici\"
        cat \"\$gecici\" > '$ENV_YOLU' && rm -f \"\$gecici\"
        echo \"  ✓ \$anahtar yenilendi\"
        eklenen=\$((eklenen+1))
      elif grep -q \"^\$anahtar=\" '$ENV_YOLU'; then
        echo \"  · \$anahtar zaten var, dokunulmadı\"
      else
        printf '%s\n' \"\$satir\" >> '$ENV_YOLU'
        echo \"  ✓ \$anahtar eklendi\"
        eklenen=\$((eklenen+1))
      fi
    done
    echo \"Toplam \$eklenen satır eklendi.\""
unset SECRET

echo
echo "Bitti. Şimdi yayınla:  npm run yayinla"
