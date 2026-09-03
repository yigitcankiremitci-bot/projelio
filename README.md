# Projelio

Freelance Proje & Görev Yönetimi

Freelancer'lar ve küçük ekipler için proje planlama, görev takibi, ekip davetleri,
canlı bildirimler, bütçe/anlaşma yönetimi ve takvim görünümü sunan platform.

## Monorepo Yapısı

```
projelio/
├── apps/
│   ├── web/        React (Vite + TS) web uygulaması — ASIL İSTEMCİ
│   └── mobile/     Expo iskeleti — 3 ekran, geliştirilmiyor
├── backend/        NestJS REST API + WebSocket (Socket.io), 46 modül
├── database/
│   ├── migrations/ PostgreSQL şema migration'ları (deploy/migrate.sh ile uygulanır)
│   └── geri-al/    Geri alma betikleri — migrations'ın DIŞINDA, bilerek
├── deploy/         Dağıtım, yedekleme, migration ve uyarı betikleri
├── landing/        Next.js tanıtım sitesi (projelio.app) — ayrı derlenir
├── packages/
│   └── shared/     Web + mobil + backend arasında paylaşılan TS tipleri
└── docs/           API referansı, kurulum ve modül tasarım notları
```

## Teknoloji Yığını

- **Frontend (Web):** React 18 + Vite + TypeScript
- **Backend:** Node.js 22 / NestJS (RESTful API + WebSockets)
- **Veritabanı:** PostgreSQL 17 (kendi VPS'imizde, Docker; PostgREST üzerinden)
- **Canlı iletişim:** Socket.io (oda tabanlı; tek sunucu örneği varsayar)
- **Tarayıcı bildirimi:** Web Push (VAPID)
- **Zamanlanmış işler:** `@nestjs/schedule` (`@Cron`) + veritabanı tabloları
- **Dosya depolama:** storage-api (kendi VPS'imizde, `api.projelio.app/storage/v1`)
- **Test:** Node'un yerleşik koşucusu (`node --test`) — vitest/jest yok

> **Kuyruk altyapısı yok.** `bullmq`, `ioredis` ve `firebase-admin` paketleri
> `backend/package.json`'da duruyor ama **hiçbiri kullanılmıyor**; Redis servisi
> de sağlanmış değil. Kuyruk gerektiren işler (WhatsApp gönderimi, sosyal medya
> yayını) veritabanı tablosu + dakikalık `@Cron` taraması ile yürüyor. Ölçek
> büyüyüp gerçek bir kuyruğa geçilecekse "zaten var" diye planlama — kurulması
> gerekiyor.

## Yerel Kurulum

Bu monorepo npm workspaces kullanır — bağımlılıkları kökten kurmak yeterli:

```bash
npm install
npm run dev          # backend + web birlikte (concurrently)
```

Ayrı ayrı çalıştırmak istersen:

```bash
npm run start:dev --workspace=backend
npm run dev --workspace=@projelio/web
```

Her uygulamada bir `.env.example` bulunur — çalıştırmadan önce `.env` olarak
kopyalayıp kendi değerlerinizi girin.

İstemci hâlâ `supabase-js` paketini kullanıyor: değişken adları `SUPABASE_*`
olarak kaldı, arkasında artık kendi PostgREST + storage-api'miz duruyor
(2026-08-30'da Supabase'den kendi VPS'imize göç edildi).

## Sık kullanılan komutlar

```bash
npm test                      # tüm testler (backend + web)
npm test -- --filter=access   # yalnızca eşleşenler
npm run typecheck             # backend + web tsc --noEmit
npm run yayinla               # kontrol et + onay al + push'la + yayını izle
./deploy/migrate.sh durum     # bekleyen migration var mı
```

## WhatsApp Bildirimleri

Platform yöneticisi Admin paneli'nden havuza numaralar ekler (QR ile); her
kullanıcıya arka planda kalıcı bir "Projelio numarası" atanır. Kullanıcılar
Ayarlar › Bağlı hesaplar'dan kod alıp o numaraya gönderince bildirimleri
WhatsApp'tan alır; Lio aynı numaradan müşterilerle yazışabilir. Köprü, resmi olmayan "Bağlı Cihazlar"
protokolünü konuşan ayrı bir konteynerdir (WAHA); backend ona yalnızca HTTP
ile bakar. Tasarım, riskler ve kurulum sırası: `docs/whatsapp-qr-plan.md`.
Sunucu kurulumu: `deploy/whatsapp-kur.sh`.

## Marka Renkleri

- Ana renk: Gri-Lacivert / Slate Navy — `#3E4858`
- İkincil renk: Bronz Kehribar — `#C0813F`
- Renkler logo paletinden türetildi (`projelio-logo.pdf`).

Detaylar için `packages/shared/src/theme.ts` dosyasına bakın.
