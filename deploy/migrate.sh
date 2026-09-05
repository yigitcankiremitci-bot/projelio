#!/usr/bin/env bash
# migrate.sh — bekleyen migration'ları uygular ve kaydeder.
#
# NEDEN VAR: migration'lar elle, tek tek uygulanıyordu ve hangisinin uygulandığı
# hiçbir yerde yazmıyordu. Atlanan bir migration ancak uygulama çalışma anında
# patlayınca fark ediliyordu; `karsilastir-sema.sh` yalnızca tablo adlarına
# baktığı için kolon/indeks/yetki değişikliklerini kaçırıyordu.
#
# Bu betik `schema_migrations` tablosunu (bkz. 083) kaynak alır:
#   · uygulanmışları atlar, yalnızca bekleyenleri çalıştırır
#   · her dosyayı TEK TRANSACTION içinde uygular (yarım kalmış migration olmaz)
#   · başarılıysa dosyanın SHA-256'sıyla birlikte kaydeder
#   · uygulandıktan sonra DEĞİŞTİRİLMİŞ dosyaları yakalar ve uyarır
#
# KULLANIM (yerelden, tailnet üzerinden):
#   ./deploy/migrate.sh durum      bekleyenleri listeler, hiçbir şey uygulamaz
#   ./deploy/migrate.sh uygula     bekleyenleri sırayla uygular
#   ./deploy/migrate.sh isaretle   hepsini "uygulanmış" say (İLK KURULUM için)
#
# İLK KURULUM: bu betik devreye girerken canlıda zaten 82 migration uygulanmış
# durumda ama kaydı yok. Önce 083'ü elle uygula, sonra `isaretle` ile mevcut
# dosyaları kaydet — yoksa betik hepsini yeniden uygulamaya kalkar.

set -Eeuo pipefail

SUNUCU="${PROJELIO_SUNUCU:-projelio@100.111.242.24}"
KONTEYNER="projelio-postgres"
KOK="$(cd "$(dirname "$0")/.." && pwd)"
DIZIN="$KOK/database/migrations"

komut="${1:-durum}"

# psql'i sunucudaki konteynerde çalıştırır. Kimlik bilgileri konteynerin kendi
# ortamından gelir; buraya hiçbir sır yazılmaz.
psql_calistir() {
  ssh "$SUNUCU" "docker exec -i $KONTEYNER sh -c 'psql -qAt -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB'"
}

# Tek bir dosyayı transaction içinde uygular. Hata olursa hiçbir şey kalıcı olmaz.
psql_dosya() {
  ssh "$SUNUCU" "docker exec -i $KONTEYNER sh -c 'psql -v ON_ERROR_STOP=1 --single-transaction -U \$POSTGRES_USER -d \$POSTGRES_DB'"
}

kayit_var_mi() {
  echo "select to_regclass('public.schema_migrations') is not null;" | psql_calistir | tr -d '[:space:]'
}

uygulananlar() {
  echo "select version from public.schema_migrations order by version;" | psql_calistir
}

toplam_sha() {
  # Windows/Git Bash ve Linux'ta aynı çıktı: yalnızca ilk alan (özet) alınır.
  sha256sum "$1" | cut -d' ' -f1
}

# Milisaniye cinsinden şimdi.
#
# NEDEN BÖYLE: `date +%s%3N` yalnızca GNU date'te çalışıyor. macOS'un BSD
# date'i `%3N`i tanımıyor ama HATA DA VERMİYOR — çıktıya olduğu gibi
# ekliyor ve "1788601930" yerine "17886019303N" basıyor. Exit kodu 0 olduğu
# için `|| date +%s000` yedeği hiç devreye girmiyordu; hata ancak bir sonraki
# satırdaki `$((bitti - basladi))` aritmetiğinde patlıyordu.
#
# Bu, migration UYGULANDIKTAN sonra ama kaydı DÜŞMEDEN önce oluyordu: şema
# değişmiş, schema_migrations boş, PostgREST önbelleği tazelenmemiş kalıyordu.
# Bir kez böyle oldu (087_kullanici_dili). Bu yüzden çıktı artık sayı mı diye
# kontrol ediliyor; değilse saniye çözünürlüğüne düşülüyor.
simdi_ms() {
  local t
  t=$(date +%s%3N 2>/dev/null || true)
  case "$t" in
    "" | *[!0-9]*) echo "$(date +%s)000" ;;
    *) echo "$t" ;;
  esac
}

if [ "$(kayit_var_mi)" != "t" ]; then
  echo "HATA: schema_migrations tablosu yok." >&2
  echo "Önce 083_migration_kaydi.sql dosyasını uygula:" >&2
  echo "  ssh $SUNUCU 'docker exec -i $KONTEYNER sh -c \"psql -v ON_ERROR_STOP=1 -U \\\$POSTGRES_USER -d \\\$POSTGRES_DB\"' < $DIZIN/083_migration_kaydi.sql" >&2
  exit 1
fi

# Uygulanmışları bir kez okuyup belleğe al (her dosya için ayrı SSH açmayalım).
mevcut="$(uygulananlar)"
uygulanmis_mi() { printf '%s\n' "$mevcut" | grep -qxF "$1"; }

bekleyen=()
for yol in "$DIZIN"/*.sql; do
  ad="$(basename "$yol")"
  uygulanmis_mi "$ad" || bekleyen+=("$ad")
done

case "$komut" in
  durum)
    echo "Toplam migration: $(ls "$DIZIN"/*.sql | wc -l | tr -d ' ')"
    echo "Uygulanmış:       $(printf '%s\n' "$mevcut" | grep -c . || true)"
    if [ "${#bekleyen[@]}" -eq 0 ]; then
      echo "Bekleyen:         yok — şema güncel."
    else
      echo "Bekleyen:         ${#bekleyen[@]}"
      printf '  · %s\n' "${bekleyen[@]}"
    fi

    # Uygulandıktan sonra değiştirilmiş dosyalar: aynı ada rağmen içerik farklı
    # demektir, yani canlıda çalışan şey artık repodaki dosya DEĞİL.
    echo ""
    echo "İçerik doğrulaması:"
    degisen=0
    while IFS='|' read -r ad kayitli; do
      [ -z "$ad" ] && continue
      yol="$DIZIN/$ad"
      [ -f "$yol" ] || { echo "  ! $ad — kayıtlı ama dosya yok"; degisen=1; continue; }
      [ -z "$kayitli" ] && continue
      simdiki="$(toplam_sha "$yol")"
      if [ "$simdiki" != "$kayitli" ]; then
        echo "  ! $ad — uygulandıktan SONRA değiştirilmiş"
        degisen=1
      fi
    done < <(echo "select version || '|' || coalesce(checksum,'') from public.schema_migrations order by version;" | psql_calistir)
    [ "$degisen" = "0" ] && echo "  tümü kayıtlarıyla aynı."
    ;;

  uygula)
    if [ "${#bekleyen[@]}" -eq 0 ]; then
      echo "Bekleyen migration yok — şema güncel."
      exit 0
    fi
    echo "Uygulanacak ${#bekleyen[@]} migration:"
    printf '  · %s\n' "${bekleyen[@]}"
    printf 'Devam edilsin mi? [e/H] '
    read -r onay
    [ "$onay" = "e" ] || [ "$onay" = "E" ] || { echo "İptal edildi."; exit 0; }

    for ad in "${bekleyen[@]}"; do
      yol="$DIZIN/$ad"
      echo "→ $ad"
      basladi=$(simdi_ms)
      if ! psql_dosya < "$yol"; then
        echo "HATA: $ad uygulanamadı. Transaction geri alındı, sonraki dosyalara geçilmedi." >&2
        exit 1
      fi
      bitti=$(simdi_ms)
      sha="$(toplam_sha "$yol")"
      printf "insert into public.schema_migrations(version, checksum, duration_ms) values ('%s','%s',%s);\n" \
        "$ad" "$sha" "$((bitti - basladi))" | psql_calistir >/dev/null
      echo "  tamam ($((bitti - basladi)) ms)"
    done

    # Şema değiştiyse PostgREST'in önbelleği tazelenmeli; yoksa yeni kolonlar
    # API'de görünmez (bkz. CLAUDE.md).
    echo "PostgREST şema önbelleği tazeleniyor..."
    echo "notify pgrst, 'reload schema';" | psql_calistir >/dev/null
    echo "Bitti."
    ;;

  isaretle)
    # İLK KURULUM: canlıda zaten uygulanmış olan dosyaları kaydeder, hiçbirini
    # çalıştırmaz. Yalnızca bir kez, bu sistem devreye alınırken kullanılır.
    if [ "${#bekleyen[@]}" -eq 0 ]; then
      echo "Kaydedilecek dosya yok."
      exit 0
    fi
    echo "DİKKAT: aşağıdaki ${#bekleyen[@]} dosya ÇALIŞTIRILMADAN 'uygulanmış' sayılacak."
    echo "Bunu yalnızca canlıda gerçekten uygulanmış olduklarından eminsen yap."
    printf '  · %s\n' "${bekleyen[@]}"
    printf 'Onaylıyor musun? [e/H] '
    read -r onay
    [ "$onay" = "e" ] || [ "$onay" = "E" ] || { echo "İptal edildi."; exit 0; }

    for ad in "${bekleyen[@]}"; do
      sha="$(toplam_sha "$DIZIN/$ad")"
      printf "insert into public.schema_migrations(version, checksum) values ('%s','%s') on conflict (version) do nothing;\n" \
        "$ad" "$sha" | psql_calistir >/dev/null
    done
    echo "${#bekleyen[@]} dosya kaydedildi."
    ;;

  *)
    echo "Kullanım: $0 [durum|uygula|isaretle]" >&2
    exit 1
    ;;
esac
