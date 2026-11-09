#!/usr/bin/env bash
# Bir izin migration'ını canlıya uygulamadan, sunucuda canlının KOPYASINDA dener.
# Canlı veritabanına yazmaz; kopya her durumda sonunda silinir.
#
# Kullanım: bash deploy/izin-deneme.sh database/migrations/184_veritabani_izin_onarimi.sql
#
# Düz `pg_dump | psql` kullanılmıyor: pg_cron yalnızca `postgres` veritabanına
# kurulabildiği için hata zinciri veriyi boş bırakıyor.

set -uo pipefail

MIGRATION="${1:?Kullanim: izin-deneme.sh <migration.sql>}"
KOK="$(cd "$(dirname "$0")/.." && pwd)"
SUNUCU="${PROJELIO_SUNUCU:-projelio@100.111.242.24}"
KONTEYNER="projelio-postgres"
KOPYA="projelio_gecis_deneme"

kapta() { ssh "$SUNUCU" "docker exec -i $KONTEYNER sh -c '$1'"; }
kopyada() { kapta "psql -qAt -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d $KOPYA"; }

temizle() {
  kapta "dropdb --if-exists -U \$POSTGRES_USER $KOPYA; rm -f /tmp/izin-deneme.dump" >/dev/null 2>&1
}
trap temizle EXIT

temizle
echo "1/4 Kopya oluşturuluyor..."
kapta "createdb -U \$POSTGRES_USER $KOPYA && pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB -Fc -N cron --exclude-extension=pg_cron -f /tmp/izin-deneme.dump" || exit 1
# pg_restore, kopyada olmayan rol/eklenti uyarılarında da sıfırdan farklı döner.
kapta "pg_restore -U \$POSTGRES_USER --no-owner -d $KOPYA /tmp/izin-deneme.dump" >/dev/null 2>&1
tablo="$(echo "select count(*) from pg_tables where schemaname = 'public';" | kopyada)"
echo "    kopyadaki tablo sayısı: $tablo"
[ "${tablo:-0}" -gt 50 ] || { echo "HATA: kopya boş ya da eksik, deneme geçersiz." >&2; exit 1; }

echo "2/4 Migration kopyaya uygulanıyor..."
if ! cikti="$(kopyada < "$MIGRATION" 2>&1)"; then
  printf '%s\n' "$cikti" | tail -5 >&2
  echo "HATA: migration kopyada düştü." >&2
  exit 1
fi

echo "3/4 İzin denetimi..."
sonuc="$(kopyada < "$KOK/scripts/db-izin-denetimi.sql")"
echo "    sonuç: ${sonuc%%|*}"
[ "${sonuc%%|*}" = "GECTI" ] || echo "$sonuc" | tr '|' '\n' | cut -c1-400

echo "4/4 Roller deneniyor..."
if echo "set role service_role; select count(*) from public.job_folders; select count(*) from public.demo_randevulari;" | kopyada >/dev/null 2>&1; then
  echo "    service_role okuyabiliyor: TAMAM"
else
  echo "    HATA: service_role okuyamıyor, uygulama bozulurdu." >&2
fi
if echo "set role anon; select count(*) from public.paytr_kart_sahipleri;" | kopyada >/dev/null 2>&1; then
  echo "    HATA: anon hassas tabloyu okuyabiliyor." >&2
else
  echo "    anon reddedildi: TAMAM"
fi
