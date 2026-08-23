#!/usr/bin/env bash
#
# Projelio veritabanı yedeği (Supabase Postgres).
#
# NE YAPAR: pg_dump ile tam bir mantıksal yedek alır (şema + veri), sıkıştırır ve
# yerel bir klasöre yazar. Geri yükleme talimatı docs/yedekleme.md'de.
#
# NE YAPMAZ — ve bunu bilerek okuman gerekiyor:
#   * Supabase Storage kovalarını (avatar/kapak görselleri) YEDEKLEMEZ. Onlar
#     Postgres'te değil, ayrı nesne deposunda. Bkz. docs/yedekleme.md.
#   * Kullanıcıların Google Drive / OneDrive dosyalarını yedeklemez — o dosyalar
#     kullanıcının kendi bulut hesabında, bizim sorumluluğumuzda değil.
#   * Kendi kendine ÇALIŞMAZ. Bu bir script; otomatik olması için bir zamanlayıcıya
#     bağlanması gerekir (docs/yedekleme.md'de seçenekler var).
#
# GÜVENLİK UYARISI: çıkan dosya veritabanının TAMAMIDIR — şifre hash'leri,
# şifrelenmiş Drive/OneDrive jetonları, tüm müşteri ve bütçe verisi. Üretim
# yedeğini rastgele bir klasörde ya da senkronize olan bir bulut dizininde
# bırakma; kaybolan bir yedek, sızmış bir veritabanıyla aynı şeydir.

set -euo pipefail

KOK="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEDEF="${PROJELIO_YEDEK_DIZINI:-$KOK/yedek}"
ZAMAN="$(date +%Y-%m-%d_%H%M%S)"
DOSYA="$HEDEF/projelio_${ZAMAN}.sql.gz"

hata() { echo "HATA: $*" >&2; exit 1; }

# --- Ön koşullar -------------------------------------------------------------

command -v pg_dump >/dev/null 2>&1 || hata "pg_dump bulunamadı.
  macOS'ta:  brew install libpq && brew link --force libpq
  Ubuntu'da: sudo apt-get install postgresql-client"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  hata "SUPABASE_DB_URL tanımlı değil.
  Supabase panelinde: Project Settings > Database > Connection string > URI
  (\"Session pooler\" değil, doğrudan bağlantıyı seç — pg_dump havuzlayıcıyla çalışmaz.)

  Kullanımı (dizeyi komut geçmişine düşürmemek için başında BOŞLUK bırak):
     SUPABASE_DB_URL='postgresql://...' scripts/yedek-al.sh"
fi

# --- Yedek -------------------------------------------------------------------

mkdir -p "$HEDEF"
chmod 700 "$HEDEF"

echo "Yedek alınıyor -> $DOSYA"

# --no-owner / --no-privileges: geri yüklerken hedef veritabanındaki rol adları
# farklı olabilir; sahiplik komutları yedeği başka bir projeye geri yüklemeyi
# gereksiz yere zorlaştırıyor.
pg_dump "$SUPABASE_DB_URL" \
  --no-owner \
  --no-privileges \
  --format=plain \
  | gzip > "$DOSYA.gecici"

mv "$DOSYA.gecici" "$DOSYA"
chmod 600 "$DOSYA"

BOYUT="$(du -h "$DOSYA" | cut -f1)"
echo "Tamam: $DOSYA ($BOYUT)"

# Boş ya da anlamsız küçük bir dosya "yedek aldım" yanılgısı yaratır — sessizce
# geçme, sesli hata ver.
BAYT="$(wc -c < "$DOSYA" | tr -d ' ')"
[ "$BAYT" -gt 10240 ] || hata "Yedek şüpheli derecede küçük ($BAYT bayt). Bağlantıyı ve izinleri kontrol et."

echo
echo "Hatırlatma: bu dosya tüm veritabanını içeriyor (şifre hash'leri dahil)."
echo "Şifreli bir yere kopyala ve buradaki kopyayı bırakmayacaksan sil."
echo "Geri yükleme ve saklama önerileri: docs/yedekleme.md"
