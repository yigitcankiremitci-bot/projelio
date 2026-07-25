#!/usr/bin/env bash
# Projelio — Demo veri oluşturma scripti
# Backend'i (http://localhost:3000) çalışır durumda iken çalıştırın:
#   bash scripts/seed-demo.sh

set -e
API_URL="${API_URL:-http://localhost:3000}"
EMAIL="demo@projelio.test"
PASSWORD="demo1234"

echo "1) Demo kullanıcı kaydediliyor..."
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"fullName\":\"Demo Kullanıcı\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")

TOKEN=$(echo "$REGISTER_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "Kayıt başarısız oldu, giriş deneniyor (kullanıcı zaten var olabilir)..."
  LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
fi

if [ -z "$TOKEN" ]; then
  echo "Token alınamadı. Backend çalışıyor mu? ($API_URL)"
  exit 1
fi

echo "2) Demo proje oluşturuluyor..."
PROJECT_RESPONSE=$(curl -s -X POST "$API_URL/projects" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"E-ticaret Web Sitesi","description":"Müşteri için sıfırdan e-ticaret platformu","totalBudget":85000,"startDate":"2026-07-01","deadline":"2026-08-12"}')

PROJECT_ID=$(echo "$PROJECT_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
echo "   Proje ID: $PROJECT_ID"

echo "3) Demo görevler ekleniyor..."
curl -s -X POST "$API_URL/projects/$PROJECT_ID/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Ödeme entegrasyonu","deadline":"2026-08-05T00:00:00.000Z"}' > /dev/null

curl -s -X POST "$API_URL/projects/$PROJECT_ID/tasks" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"title":"Ürün filtreleri","deadline":"2026-08-08T00:00:00.000Z"}' > /dev/null

echo ""
echo "Demo veri hazır."
echo "Web arayüzünden giriş yapın: http://localhost:5173/login"
echo "  E-posta:  $EMAIL"
echo "  Şifre:    $PASSWORD"
