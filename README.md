# Projelio

Freelance Proje & Görev Yönetimi

Freelancer'lar ve küçük ekipler için proje planlama, görev takibi, ekip davetleri,
canlı bildirimler, bütçe/anlaşma yönetimi ve takvim görünümü sunan platform.

## Monorepo Yapısı

```
projelio/
├── apps/
│   ├── web/        React (Vite + TS) web uygulaması
│   └── mobile/     React Native (Expo) mobil uygulama
├── backend/        NestJS REST API + WebSocket (Socket.io)
├── database/
│   └── migrations/ PostgreSQL şema migration'ları (canlıya elle uygulanır)
├── landing/        Next.js tanıtım sitesi (projelio.app) — ayrı derlenir
├── packages/
│   └── shared/     Web + mobil + backend arasında paylaşılan TS tipleri
└── docs/
    └── api-endpoints.md  API endpoint referansı
```

## Teknoloji Yığını

- **Frontend (Web):** React + Vite + TypeScript
- **Mobil:** React Native (Expo)
- **Backend:** Node.js / NestJS (RESTful API + WebSockets)
- **Veritabanı:** PostgreSQL 17 (kendi VPS'imizde, Docker; PostgREST üzerinden)
- **Canlı iletişim:** Socket.io + Firebase Cloud Messaging (mobil push)
- **Kuyruk / zamanlanmış görevler:** BullMQ + Redis
- **Dosya depolama:** storage-api (kendi VPS'imizde, `api.projelio.app/storage/v1`)

## Yerel Kurulum (root'tan tek seferde)

Bu monorepo npm workspaces kullanır — bağımlılıkları root'tan kurmak yeterli:

```bash
npm install          # root'ta: web + mobile + backend + shared paketini kurar
docker compose up -d # Redis'i başlatır (BullMQ için)

# Backend'i ayrı terminalde çalıştır
npm run start:dev --workspace=backend

# Web'i ayrı terminalde çalıştır
npm run dev --workspace=@projelio/web

# Mobili ayrı terminalde çalıştır
npm run start --workspace=@projelio/mobile
```

Her uygulamada bir `.env.example` bulunur — çalıştırmadan önce `.env` olarak
kopyalayıp kendi değerlerinizi girin (veritabanı adresi ve anahtarı zaten dolu).
İstemci hâlâ `supabase-js`: değişken adları `SUPABASE_*` olarak kaldı, arkasında
artık kendi PostgREST + storage-api'miz duruyor.

## Marka Renkleri

- Ana renk: Gri-Lacivert / Slate Navy — `#3E4858`
- İkincil renk: Bronz Kehribar — `#C0813F`
- Renkler logo paletinden türetildi (`projelio-logo.pdf`).

Detaylar için `packages/shared/src/theme.ts` dosyasına bakın.
