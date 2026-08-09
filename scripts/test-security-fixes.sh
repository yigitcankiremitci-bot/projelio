#!/usr/bin/env bash
# Projelio — Yetkilendirme düzeltmelerini doğrulama scripti
#
# Backend'i (http://localhost:3000) çalışır durumda iken çalıştırın:
#   bash scripts/test-security-fixes.sh
#
# İki test kullanıcısı oluşturur (A ve B), A'nın bir projesine B'nin erişmeye
# çalışmasını simüle eder. Düzeltmeler doğru çalışıyorsa B'nin tüm denemeleri
# 403 (Forbidden) ile reddedilmeli; A'nın kendi projesindeki işlemleri ise
# normal şekilde başarılı olmalı.
#
# NOT: gerçek Supabase veritabanınıza iki test kullanıcısı + bir test projesi
# ekler (security-test-a@projelio.test / security-test-b@projelio.test).
# İsterseniz sonunda projeyi ve görevi silebilirsiniz; kullanıcıları silmek
# için backend'de bir uç nokta yok (elle Supabase'den silinebilir).

set -o pipefail
API_URL="${API_URL:-http://localhost:3000}"
PASSWORD="testsifre1234"
EMAIL_A="security-test-a@projelio.test"
EMAIL_B="security-test-b@projelio.test"

PASS=0
FAIL=0
RESP_FILE=$(mktemp)
trap 'rm -f "$RESP_FILE"' EXIT

# call METHOD PATH TOKEN BODY  ->  stdout: HTTP status kodu, gövde $RESP_FILE'a yazılır
# NOT: macOS'un varsayılan bash'i (3.2) çok eski; boş bir array'i "${arr[@]}" ile
# genişletmek orada "unbound variable" hatası veriyor (bilinen bash 3.2 hatası).
# Bu yüzden array yerine token'ı doğrudan (boşsa boş bir header olarak) gönderiyoruz.
call() {
  local method="$1" path="$2" token="$3" body="${4:-}"
  if [ -n "$body" ]; then
    curl -s -o "$RESP_FILE" -w "%{http_code}" -X "$method" "$API_URL$path" \
      -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d "$body"
  else
    curl -s -o "$RESP_FILE" -w "%{http_code}" -X "$method" "$API_URL$path" \
      -H "Content-Type: application/json" -H "Authorization: Bearer $token"
  fi
}

json_field() {
  # basit tek seviye string alan çıkarma (seed-demo.sh'teki ile aynı yöntem)
  grep -o "\"$1\":\"[^\"]*" "$RESP_FILE" | head -1 | cut -d'"' -f4
}

expect() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  [OK]   $desc (HTTP $actual)"
    PASS=$((PASS + 1))
  else
    echo "  [FAIL] $desc (beklenen HTTP $expected, gelen HTTP $actual)"
    echo "         Yanıt: $(cat "$RESP_FILE" | head -c 300)"
    FAIL=$((FAIL + 1))
  fi
}

# Kayıt artık token DÖNDÜRMÜYOR: e-posta doğrulaması gerekiyor (bkz.
# 044_email_verification.sql). Test kullanıcıları gerçek bir posta kutusuna sahip
# olmadığı için doğrulama bağlantısına tıklanamaz; bu yüzden hesabı oluşturduktan
# sonra doğrulamayı doğrudan veritabanında yapmamız gerekir.
#
# Bunu backend üzerinden yapmanın bir yolu yok (kasıtlı) — bu yüzden test
# kullanıcıları BİR KEZ elle doğrulanmalı. Aşağıdaki uyarı bunu hatırlatır.
register_or_login() {
  local full_name="$1" email="$2" username="$3"
  local status
  status=$(call POST /auth/register "" "{\"fullName\":\"$full_name\",\"email\":\"$email\",\"password\":\"$PASSWORD\",\"username\":\"$username\"}")
  local token
  status=$(call POST /auth/login "" "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
  token=$(json_field token)
  if [ -z "$token" ] && [ "$status" = "403" ]; then
    echo "__UNVERIFIED__"
    return
  fi
  echo "$token"
}

echo "1) Test kullanıcıları hazırlanıyor..."
TOKEN_A=$(register_or_login "Güvenlik Test A" "$EMAIL_A" "securitytesta")
TOKEN_B=$(register_or_login "Güvenlik Test B" "$EMAIL_B" "securitytestb")

if [ "$TOKEN_A" = "__UNVERIFIED__" ] || [ "$TOKEN_B" = "__UNVERIFIED__" ]; then
  cat <<'UYARI'
   Test kullanıcıları e-posta doğrulaması beklediği için giriş yapamıyor.

   Bu tek seferlik bir adım: Supabase panelinde SQL Editor'e girip aşağıdaki
   komutu çalıştırın, sonra bu scripti tekrar başlatın. (Komut yalnızca bu iki
   test hesabını doğrulanmış işaretler, gerçek kullanıcılara dokunmaz.)

     update public.users
     set email_verified_at = current_timestamp
     where email in ('security-test-a@projelio.test', 'security-test-b@projelio.test');
UYARI
  exit 1
fi

if [ -z "$TOKEN_A" ] || [ -z "$TOKEN_B" ]; then
  echo "Token alınamadı. Backend çalışıyor mu? ($API_URL)"
  exit 1
fi
echo "   A ve B için token alındı."

echo "2) A bir iş, proje ve görev oluşturuyor..."
# NOT: projects.job_id veritabanında NOT NULL (bkz. 006_jobs.sql) — her proje
# mutlaka bir "İş"in altında yaşar. Bu yüzden önce bir iş oluşturuluyor.
STATUS=$(call POST /jobs "$TOKEN_A" '{"title":"Güvenlik Test İşi"}')
JOB_ID=$(json_field id)
if [ -z "$JOB_ID" ]; then
  echo "   İş oluşturulamadı. HTTP $STATUS, yanıt:"
  echo "   $(cat "$RESP_FILE")"
  exit 1
fi

STATUS=$(call POST /projects "$TOKEN_A" "{\"jobId\":\"$JOB_ID\",\"title\":\"Güvenlik Test Projesi\",\"totalBudget\":10000,\"startDate\":\"2026-01-01\",\"deadline\":\"2026-12-31\"}")
PROJECT_ID=$(json_field id)
if [ -z "$PROJECT_ID" ]; then
  echo "   Proje oluşturulamadı. HTTP $STATUS, yanıt:"
  echo "   $(cat "$RESP_FILE")"
  exit 1
fi

STATUS=$(call POST "/projects/$PROJECT_ID/tasks" "$TOKEN_A" '{"title":"Test görevi","deadline":"2026-12-31T00:00:00.000Z"}')
TASK_ID=$(json_field id)
if [ -z "$TASK_ID" ]; then
  echo "   Görev oluşturulamadı. HTTP $STATUS, yanıt:"
  echo "   $(cat "$RESP_FILE")"
  exit 1
fi
echo "   Proje: $PROJECT_ID  Görev: $TASK_ID"

echo ""
echo "3) B, A'nın projesine izinsiz erişmeye çalışıyor (hepsi 403 dönmeli):"
expect "B proje detayını göremiyor"            403 "$(call GET "/projects/$PROJECT_ID" "$TOKEN_B")"
expect "B projeye görev ekleyemiyor"            403 "$(call POST "/projects/$PROJECT_ID/tasks" "$TOKEN_B" '{"title":"izinsiz görev","deadline":"2026-12-31T00:00:00.000Z"}')"
expect "B mevcut görevi düzenleyemiyor"         403 "$(call PATCH "/tasks/$TASK_ID" "$TOKEN_B" '{"title":"ele geçirildi"}')"
expect "B görevi silemiyor"                     403 "$(call DELETE "/tasks/$TASK_ID" "$TOKEN_B" "")"
expect "B bütçeyi göremiyor"                    403 "$(call GET "/projects/$PROJECT_ID/budget" "$TOKEN_B")"
expect "B bütçeye kayıt ekleyemiyor"             403 "$(call POST "/projects/$PROJECT_ID/budget" "$TOKEN_B" '{"type":"income","amount":999999}')"
expect "B kendini onaylı üye yapamıyor"          403 "$(call POST "/projects/$PROJECT_ID/members" "$TOKEN_B" '{"userId":"00000000-0000-0000-0000-000000000001","role":"member"}')"

echo ""
echo "4) A kendi projesinde normal şekilde çalışabiliyor (hepsi başarılı dönmeli):"
expect "A proje detayını görebiliyor"           200 "$(call GET "/projects/$PROJECT_ID" "$TOKEN_A")"
expect "A görevi güncelleyebiliyor"             200 "$(call PATCH "/tasks/$TASK_ID" "$TOKEN_A" '{"title":"Test görevi (güncellendi)"}')"
expect "A bütçe kaydı ekleyebiliyor"             201 "$(call POST "/projects/$PROJECT_ID/budget" "$TOKEN_A" '{"type":"expense","amount":100}')"

# ---------------------------------------------------------------------------
# Buraya kadarki testler "yabancı engelleniyor mu?" sorusunu yanıtladı. Asıl
# ikinci risk bunun tersi: yeni kısıtlamalar fazla sıkı olup GERÇEK ekip
# üyelerini de engelliyor olabilir. Aşağıdaki bölümler onu ölçüyor.
# ---------------------------------------------------------------------------

echo ""
echo "5) A, B'yi ekibe onaylı üye olarak ekliyor..."
call GET /auth/me "$TOKEN_B" > /dev/null
USER_B_ID=$(json_field id)
if [ -z "$USER_B_ID" ]; then
  echo "   B'nin kullanıcı kimliği alınamadı, ekip üyesi testleri atlanıyor."
else
  STATUS=$(call POST "/projects/$PROJECT_ID/members" "$TOKEN_A" "{\"userId\":\"$USER_B_ID\",\"role\":\"member\"}")
  MEMBER_ID=$(json_field id)
  expect "A ekibe üye ekleyebiliyor"              201 "$STATUS"

  echo ""
  echo "6) B artık onaylı ekip üyesi — günlük işlerini yapabilmeli:"
  expect "B proje detayını görebiliyor"           200 "$(call GET "/projects/$PROJECT_ID" "$TOKEN_B")"
  expect "B görev listesini görebiliyor"          200 "$(call GET "/projects/$PROJECT_ID/tasks" "$TOKEN_B")"
  expect "B görev ekleyebiliyor"                  201 "$(call POST "/projects/$PROJECT_ID/tasks" "$TOKEN_B" '{"title":"Ekip üyesi görevi","deadline":"2026-12-31T00:00:00.000Z"}')"
  expect "B görevi güncelleyebiliyor"             200 "$(call PATCH "/tasks/$TASK_ID" "$TOKEN_B" '{"title":"Ekip üyesi güncelledi"}')"

  echo ""
  echo "7) Ama B, sahibe özel işleri hâlâ yapamamalı:"
  expect "B bütçeyi göremiyor (izin verilmedi)"   403 "$(call GET "/projects/$PROJECT_ID/budget" "$TOKEN_B")"
  expect "B bütçeye kayıt ekleyemiyor"            403 "$(call POST "/projects/$PROJECT_ID/budget" "$TOKEN_B" '{"type":"income","amount":999999}')"
  expect "B başkasını ekibe ekleyemiyor"          403 "$(call POST "/projects/$PROJECT_ID/members" "$TOKEN_B" '{"userId":"00000000-0000-0000-0000-000000000001","role":"member"}')"

  if [ -n "$MEMBER_ID" ]; then
    echo ""
    echo "8) A, B'ye bütçe görme izni veriyor:"
    expect "A izni verebiliyor"                   200 "$(call PATCH "/members/$MEMBER_ID/budget-visibility" "$TOKEN_A" '{"canViewBudget":true}')"
    expect "B artık bütçeyi görebiliyor"          200 "$(call GET "/projects/$PROJECT_ID/budget" "$TOKEN_B")"
    expect "B yine de kayıt ekleyemiyor"          403 "$(call POST "/projects/$PROJECT_ID/budget" "$TOKEN_B" '{"type":"income","amount":999999}')"
  fi
fi

echo ""
echo "9) Temizlik: test projesi ve işi arşivleniyor..."
call PATCH "/projects/$PROJECT_ID/archive" "$TOKEN_A" "" > /dev/null
call PATCH "/jobs/$JOB_ID/archive" "$TOKEN_A" "" > /dev/null

echo ""
echo "-----------------------------------------"
echo "Sonuç: $PASS başarılı, $FAIL başarısız."
if [ "$FAIL" -gt 0 ]; then
  echo "Bazı testler beklenenden farklı sonuç verdi — yukarıdaki [FAIL] satırlarına bakın."
  exit 1
fi
echo "Tüm yetkilendirme testleri beklendiği gibi geçti."
