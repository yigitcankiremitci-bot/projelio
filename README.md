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
│   └── migrations/ PostgreSQL şema migration'ları (Supabase'e uygulanmış hâli)
├── packages/
│   └── shared/     Web + mobil + backend arasında paylaşılan TS tipleri
└── docs/
    └── api-endpoints.md  API endpoint referansı
```

## Teknoloji Yığını

- **Frontend (Web):** React + Vite + TypeScript
- **Mobil:** React Native (Expo)
- **Backend:** Node.js / NestJS (RESTful API + WebSockets)
- **Veritabanı:** PostgreSQL (Supabase üzerinde barındırılıyor)
- **Canlı iletişim:** Socket.io + Firebase Cloud Messaging (mobil push)
- **Kuyruk / zamanlanmış görevler:** BullMQ + Redis
- **Dosya depolama:** Supabase Storage

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
kopyalayıp kendi değerlerinizi girin (Supabase URL/anon key zaten dolu).

## Marka Renkleri

- Ana renk: Gri-Lacivert / Slate Navy — `#3E4858`
- İkincil renk: Bronz Kehribar — `#C0813F`
- Renkler logo paletinden türetildi (`projelio-logo.pdf`).

Detaylar için `packages/shared/src/theme.ts` dosyasına bakın.
