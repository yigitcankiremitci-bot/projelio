#!/usr/bin/env bash
# whatsapp-kur.sh — VPS'te WhatsApp köprüsünün (WAHA) tek seferlik kurulumu.
#
# NE YAPAR:
#   1. .env'de eksik olan WAHA sırlarını üretip dosyanın sonuna ekler
#      (WAHA_API_KEY, WAHA_WEBHOOK_HMAC, WAHA_DB_PASSWORD). Var olana dokunmaz —
#      betik tekrar koşulabilir.
#   2. Postgres'te "waha" rolünü ve "waha" veritabanını açar. Rol CREATEDB
#      yetkili: WAHA oturum başına kendi veritabanını oluşturuyor.
#   3. Şifre ile rolün şifresi tutarlı olsun diye rol şifresini her koşuda
#      .env'deki değere eşitler.
#
# NEDEN AYRI BETİK: compose dosyası dağıtımla kendiliğinden gelir ama env
# sırları ve veritabanı rolü gelmez. Bunlar eksikken `docker compose up` waha
# konteynerini boş API anahtarıyla ayağa kaldırır. Kurulum sırası: önce bu
# betik, sonra `npm run yayinla`.
#
# KULLANIM (sunucuda, projelio kullanıcısıyla):
#   /srv/projelio/deploy/whatsapp-kur.sh
#
# Sonrasında (compose güncellendiyse) uygulama dağıtımı waha'yı kaldırır;
# elle kaldırmak için: cd /srv/projelio/deploy && docker compose -f docker-compose.prod.yml up -d waha backend

set -Eeuo pipefail

KOK="/srv/projelio"
ENV_DOSYA="${PROJELIO_ENV:-$KOK/deploy/.env}"

[ -f "$ENV_DOSYA" ] || { echo "HATA: $ENV_DOSYA yok." >&2; exit 1; }
docker inspect projelio-postgres >/dev/null 2>&1 || { echo "HATA: projelio-postgres konteyneri ayakta değil." >&2; exit 1; }

# '/+=' bağlantı dizesinde sorun çıkarır (.env.prod.example'daki gerekçe).
uret() { openssl rand -base64 48 | tr -d '\n/+=' | head -c 40; }

# .env'de anahtar yoksa (ya da boşsa) üretip ekler; varsa dokunmaz.
ekle_yoksa() {
  local ad="$1"
  local mevcut
  mevcut="$(grep -E "^${ad}=" "$ENV_DOSYA" | tail -1 | cut -d= -f2- || true)"
  if [ -n "$mevcut" ]; then
    echo "$ad zaten tanımlı, korunuyor."
    return
  fi
  # Boş satır olarak duruyorsa (örnekten kopyalanmış) onu kaldırıp yeniden yazıyoruz.
  # sed -i KULLANILMIYOR: klasör root'un, geçici dosya açamıyor; dosyanın
  # kendisi projelio'nun olduğu için yerinde üzerine yazmak çalışıyor.
  local icerik
  icerik="$(grep -v -E "^${ad}=$" "$ENV_DOSYA" || true)"
  printf '%s\n' "$icerik" > "$ENV_DOSYA"
  printf '%s=%s\n' "$ad" "$(uret)" >> "$ENV_DOSYA"
  echo "$ad üretildi."
}

ekle_yoksa WAHA_API_KEY
ekle_yoksa WAHA_WEBHOOK_HMAC
ekle_yoksa WAHA_DB_PASSWORD

chmod 600 "$ENV_DOSYA"

WAHA_DB_PASSWORD="$(grep -E '^WAHA_DB_PASSWORD=' "$ENV_DOSYA" | tail -1 | cut -d= -f2-)"

# Rol yoksa açılır; varsa yalnızca şifresi eşitlenir. Veritabanı yoksa açılır.
# psql'e şifre tek tırnak içinde gidiyor; uret() tırnak üretmediği için güvenli.
docker exec -i projelio-postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<SQL
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = 'waha') then
    create role waha login createdb password '${WAHA_DB_PASSWORD}';
  else
    alter role waha with login createdb password '${WAHA_DB_PASSWORD}';
  end if;
end
\$\$;
SQL

# create database işlem bloğu içinde çalışmaz; ayrı komut.
if ! docker exec projelio-postgres sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select 1 from pg_database where datname = '"'"'waha'"'"'"' | grep -q 1; then
  docker exec projelio-postgres sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "create database waha owner waha"'
  echo "waha veritabanı açıldı."
else
  echo "waha veritabanı zaten var."
fi

echo
echo "Kurulum tamam. Sıradaki adım: yerelde 'npm run yayinla' (compose waha servisini kaldırır)."
echo "Doğrulama: docker exec projelio-backend node -e \"fetch('http://waha:3000/ping',{headers:{'X-Api-Key':process.env.WAHA_API_KEY}}).then(r=>console.log(r.status))\""
