#!/usr/bin/env bash
# FCM (mobil bildirim) servis hesabı anahtarını sunucunun .env'ine yazar.
#
# NE YAPIYOR
#   Firebase konsolundan inen servis hesabı JSON'undan üç değeri çıkarır
#   (project_id, client_email, private_key), sunucudaki deploy/.env'e
#   FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY olarak yazar (eski
#   hâlini sunucuda ~/env-yedek/ altına yedekler) ve backend
#   konteynerini yeniden oluşturur (env_file değişikliği `restart` ile okunmaz,
#   `up -d` gerekir).
#
# ANAHTAR EKRANA BASILMAZ. Değerler yerelde okunup doğrudan SSH'ın standart
# girdisine verilir; komut satırına, geçmişe ya da log'a düşmez. Ekrana yalnızca
# proje kimliği ve servis hesabının e-postası yazılır.
#
# KULLANIM
#   ./deploy/fcm-anahtar-yukle.sh                     # İndirilenler'deki en yeni anahtar
#   ./deploy/fcm-anahtar-yukle.sh ~/Downloads/x.json  # belirli dosya
#
# Anahtar dosyası yoksa: Firebase konsolu > Proje ayarları > Hizmet hesapları >
# "Yeni özel anahtar oluştur". Bkz. docs/mobil-bildirimler.md

set -euo pipefail

SUNUCU="${PROJELIO_SUNUCU:-projelio@100.111.242.24}"   # tailnet; genel IP'de 22 kapalı
KOK="$(cd "$(dirname "$0")/.." && pwd)"
GS_JSON="$KOK/apps/mobile/android/app/google-services.json"

dosya="${1:-}"
if [ -z "$dosya" ]; then
  # Firebase'in verdiği ad: <proje>-firebase-adminsdk-<kısa>-<hash>.json
  dosya="$(ls -t "$HOME"/Downloads/*firebase-adminsdk*.json 2>/dev/null | head -1 || true)"
  if [ -z "$dosya" ]; then
    echo "İndirilenler klasöründe Firebase anahtarı bulunamadı (…firebase-adminsdk….json)."
    echo "Görünüşe göre anahtar henüz oluşturulmamış. Oluşturmak için:"
    echo "  Firebase konsolu > ⚙ Proje ayarları > Hizmet hesapları > \"Yeni özel anahtar oluştur\""
    echo "İnen dosyayla yeniden çalıştır:  ./deploy/fcm-anahtar-yukle.sh"
    exit 1
  fi
fi
[ -f "$dosya" ] || { echo "Dosya yok: $dosya"; exit 1; }
echo "Anahtar dosyası: $dosya"

# Doğrulama + özet (anahtarın kendisi yazdırılmaz).
python3 - "$dosya" "$GS_JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
if d.get("type") != "service_account" or not d.get("private_key") or not d.get("client_email"):
    sys.exit("Bu dosya bir servis hesabı anahtarı değil (google-services.json değil, 'Yeni özel anahtar' ile inen dosya olmalı).")
print(f"  Proje           : {d['project_id']}")
print(f"  Servis hesabı   : {d['client_email']}")
try:
    uyg = json.load(open(sys.argv[2]))["project_info"]["project_id"]
    if uyg != d["project_id"]:
        sys.exit(f"UYUMSUZ: uygulamanın Firebase projesi '{uyg}', anahtar '{d['project_id']}' projesine ait. Doğru projeden anahtar indir.")
    print(f"  Uygulamayla     : uyumlu ({uyg})")
except FileNotFoundError:
    print("  (google-services.json yok; proje uyumu denetlenmedi)")
PY

printf 'Sunucudaki .env güncellensin ve backend yeniden başlatılsın mı? [e/H] '
read -r onay
[ "$onay" = "e" ] || [ "$onay" = "E" ] || { echo "İptal edildi."; exit 0; }

# Uzak betik tek tırnaklı heredoc'ta: yerelde HİÇBİR şey açılmaz, $(date) ve
# döngü değişkenleri sunucuda çalışır.
#
# /srv/projelio/deploy root'a ait (projelio kullanıcısı oraya yeni dosya
# AÇAMAZ), ama .env'in sahibi projelio. Bu yüzden: yedek ev klasörüne, yeni
# içerik /tmp'de hazırlanır ve .env YERİNDE yazılır (cat >) — sahiplik ve
# 600 izni korunur.
UZAK_BETIK=$(cat <<'UZAK'
set -e
ENV=/srv/projelio/deploy/.env
COMPOSE=/srv/projelio/deploy/docker-compose.prod.yml
mkdir -p "$HOME/env-yedek" && chmod 700 "$HOME/env-yedek"
YEDEK="$HOME/env-yedek/env.$(date +%Y%m%d%H%M%S)"
cp "$ENV" "$YEDEK" && chmod 600 "$YEDEK"
GECICI=$(mktemp) && chmod 600 "$GECICI"
trap 'rm -f "$GECICI"' EXIT
grep -v '^FCM_\(PROJECT_ID\|CLIENT_EMAIL\|PRIVATE_KEY\)=' "$ENV" > "$GECICI" || true
cat >> "$GECICI"
cat "$GECICI" > "$ENV"
echo "  .env güncellendi (eski hâli: $YEDEK)."
docker compose -f "$COMPOSE" up -d --no-build backend >/dev/null 2>&1
echo "  Backend yeniden oluşturuldu, açılış bekleniyor…"
for i in $(seq 1 30); do
  docker logs projelio-backend --since 2m 2>&1 | grep -q 'successfully started' && break
  sleep 2
done
if docker logs projelio-backend --since 2m 2>&1 | grep -q 'FCM_\* tanımlı değil'; then
  echo "  ✗ Backend FCM anahtarını görmüyor."
  exit 1
fi
if docker logs projelio-backend --since 2m 2>&1 | grep -q 'successfully started'; then
  echo "  ✓ Backend ayakta; FCM uyarısı yok."
else
  echo "  ✗ Backend 60 sn içinde açılmadı: docker logs projelio-backend"
  exit 1
fi
UZAK
)

# Satırlar yerelde üretilir. private_key tek satır, satır sonları \n olarak
# (fcm.ts bunları geri çeviriyor). Tek tırnak: Compose env_file'da tek tırnaklı
# değer olduğu gibi okunur, kaçış yorumlanmaz.
python3 - "$dosya" <<'PY' | ssh -o ConnectTimeout=10 "$SUNUCU" "$UZAK_BETIK"
import json, sys
d = json.load(open(sys.argv[1]))
key = d["private_key"].replace("\n", "\\n")
print(f"FCM_PROJECT_ID={d['project_id']}")
print(f"FCM_CLIENT_EMAIL={d['client_email']}")
print(f"FCM_PRIVATE_KEY='{key}'")
PY

echo "Bitti. İndirilen anahtar dosyasını artık silebilirsin: $dosya"
