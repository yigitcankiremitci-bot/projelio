# Projelio — UI Ekran Tasarımları

Bu doküman ana ekranların amacını, bileşenlerini ve marka renklerinin nasıl
kullanıldığını özetler. Web tarafındaki karşılıkları `apps/web/src/pages/`,
mobil tarafındaki karşılıkları `apps/mobile/src/screens/` altındadır.

## Renk Kullanımı

- **Ana renk (#1E3A8A — Derin Okyanus Mavisi):** Navbar, birincil butonlar, aktif durum vurguları.
- **İkincil renk (#F59E0B — Kehribar):** Bütçe rakamları, durum rozetleri, premium/tamamlanma vurguları.
- Durum rozetleri anlamsal renklerle: Aktif = yeşil tonu, Arşivlendi = amber tonu, Tamamlandı = mavi tonu.

## Ekranlar

### 1. Giriş (Login)
E-posta/şifre ile giriş. Ortalanmış, sade form. `apps/web/src/pages/Login.tsx`,
`apps/mobile/src/screens/LoginScreen.tsx`.

### 2. Ana Sayfa (Dashboard)
Üstte 3 özet metrik kartı (aktif proje sayısı, yaklaşan deadline sayısı,
toplam bütçe), altta proje kartları grid'i. Her proje kartı başlık, açıklama,
durum rozeti, bütçe ve bitiş tarihini gösterir. `apps/web/src/pages/Dashboard.tsx`.

### 3. Proje Detayı / Görev Panosu
Üç kolonlu kanban görünümü: Yapılacak / Devam Eden / Tamamlandı. Görev kartları
sürükle-bırak ile kolonlar arasında taşınabilir (ileride `dnd-kit` ile
uygulanacak). `apps/web/src/pages/ProjectDetail.tsx`.

### 4. Takvim
Günlük / Haftalık / Aylık görünüm seçici + "Sadece Benim Görevlerim" /
"Tüm Ekip Takvimi" filtresi. Görevler sürükle-bırak ile tarih güncellemesi
alır. `apps/web/src/pages/Calendar.tsx`.

### 5. Korumalı Admin Paneli
Şifre ekranının arkasında: kullanıcı listesi, aktif/tamamlanmış proje
istatistikleri, sistem durumu. `apps/web/src/pages/AdminPanel.tsx`.

## Mockup

Ana sayfa + proje detay panosu için görsel mockup sohbet içinde
`projelio_dashboard_mockup` başlığıyla paylaşıldı.
