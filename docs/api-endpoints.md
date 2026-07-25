# Projelio — API Endpoint Referansı

Base URL: `http://localhost:3000` (backend `.env` içindeki `PORT` değişkenine göre değişir)

Aksi belirtilmedikçe tüm endpoint'ler `Authorization: Bearer <JWT>` header'ı gerektirir
(`@UseGuards(AuthGuard('jwt'))`). Admin'e özel endpoint'ler ayrıca `RolesGuard` ile korunur.

## Auth (`/auth`)

| Method | Path | Açıklama | Body |
|---|---|---|---|
| POST | `/auth/register` | Yeni kullanıcı kaydı | `{ fullName, email, password }` |
| POST | `/auth/login` | Giriş, JWT döner | `{ email, password }` |

Yanıt: `{ token: string }`

## Kullanıcılar (`/users`)

| Method | Path | Açıklama |
|---|---|---|
| GET | `/users` | Tüm kullanıcıları listele |
| GET | `/users/:id` | Tek kullanıcı detayı |

## Projeler (`/projects`)

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/projects` | Oturum sahibinin projelerini listele | — |
| GET | `/projects/:id` | Proje detayı | — |
| POST | `/projects` | Yeni proje oluştur | `{ title, description?, totalBudget?, startDate?, deadline? }` |
| PATCH | `/projects/:id` | Proje güncelle | Kısmi `Project` alanları |
| DELETE | `/projects/:id` | Proje sil | — |

## Görevler (`/projects/:projectId/tasks`, `/tasks/:id`)

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/projects/:projectId/tasks` | Projenin görevlerini listele | — |
| POST | `/projects/:projectId/tasks` | Görev oluştur | `{ title, assignedTo?, startDate?, deadline }` |
| PATCH | `/tasks/:id/status` | Durum güncelle | `{ status: "todo" \| "in_progress" \| "completed" }` |
| PATCH | `/tasks/:id/schedule` | Tarih güncelle (takvimde sürükle-bırak) | `{ startDate?, deadline? }` |
| DELETE | `/tasks/:id` | Görev sil | — |

## Ekip Üyeleri & Davetler (`/projects/:projectId/members`, `/members/:id`)

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/projects/:projectId/members` | Proje üyelerini listele | — |
| POST | `/projects/:projectId/members/invite` | Yönetici davet gönderir | `{ userId, role? }` |
| POST | `/projects/:projectId/members/join-request` | Freelancer katılım isteği atar | `{ userId }` |
| PATCH | `/members/:id/respond` | İsteği onayla/reddet | `{ approve: boolean }` |
| PATCH | `/members/:id/rate` | Kişiye özel ücret anlaşması belirle | `{ rate: number }` |

## Bütçe (`/projects/:projectId/budget`)

| Method | Path | Açıklama | Body / Query |
|---|---|---|---|
| GET | `/projects/:projectId/budget` | Bütçe işlemlerini listele | — |
| POST | `/projects/:projectId/budget` | Gelir/gider/hakediş ekle | `{ type: "income"\|"expense"\|"payout", amount, userId?, description? }` |
| GET | `/projects/:projectId/budget/margin` | Kalan marj hesapla | `?totalBudget=<number>` |
| GET | `/projects/:projectId/budget/export` | Excel/PDF dışa aktarma | `?format=xlsx\|pdf` |

## Takvim (`/calendar`)

| Method | Path | Açıklama | Query |
|---|---|---|---|
| GET | `/calendar` | Filtrelenmiş görev listesi | `?projectId=<id>&scope=mine\|team` |

## Admin (`/admin`) — sadece `role: admin`

| Method | Path | Açıklama |
|---|---|---|
| GET | `/admin/stats` | Kullanıcı sayısı, aktif/tamamlanmış proje istatistikleri |
| GET | `/admin/users` | Tüm kullanıcıları listele |

## Canlı Bildirimler (WebSocket — Socket.io)

Bağlantı sonrası istemci `register` event'iyle kendi `userId`'sini gönderir;
sunucu o kullanıcıya özel `user:<id>` odasına katılır.

| Event (client → server) | Payload | Açıklama |
|---|---|---|
| `register` | `userId: string` | Soket bağlantısını kullanıcıya bağlar |

| Event (server → client) | Payload | Açıklama |
|---|---|---|
| `notification` | `NotificationPayload` (bkz. `packages/shared/src/types.ts`) | Davet, rol güncellemesi, bütçe değişikliği, deadline hatırlatması |

Bildirim tipleri: `task_due_24h`, `task_due_1h`, `project_deadline_24h`,
`team_invite`, `role_updated`, `budget_changed`, `join_request`.

Deadline hatırlatmaları `DeadlineReminderProcessor` (BullMQ/CRON, `@nestjs/schedule`)
tarafından saatlik kontrol edilir ve eşik aşıldığında `NotificationsService.notifyUser`
üzerinden hem Socket.io hem FCM (mobil push) ile iletilir.
