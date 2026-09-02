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

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/users` | Tüm kullanıcıları listele | — |
| GET | `/users/:id` | Tek kullanıcı detayı | — |
| PATCH | `/users/me/onboarding` | Kurulum sihirbazını tamamlar | `{ accountType, organizationName?, orgType?, groupName?, title?, bio?, phone?, sector?, teamSize?, useCases?, onboardingModules? }` |

`accountType` dışındaki tüm alanlar opsiyoneldir (sihirbazın adımları atlanabiliyor).
`sector`/`teamSize`/`useCases` için geçerli değerler `packages/shared/src/types.ts`
içindeki `SECTORS`, `TEAM_SIZES`, `USE_CASES` listelerinde; geçersiz değer hata
üretmez, sessizce düşürülür.

`phone`, `sector`, `teamSize`, `useCases` ve `onboardingModules` **yalnızca**
`GET /auth/me` ile kişinin kendisine döner — `/users/:id` ve `/users/search`
yanıtlarında bilerek yer almaz.

## Projeler (`/projects`)

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/projects` | Oturum sahibinin projelerini listele | — |
| GET | `/projects/:id` | Proje detayı | — |
| POST | `/projects` | Yeni proje oluştur | `{ title, description?, totalBudget?, startDate?, deadline? }` |
| PATCH | `/projects/:id` | Proje güncelle | Kısmi `Project` alanları |
| DELETE | `/projects/:id` | Proje sil | — |

## Proje Takip Linkleri (`/projects/:projectId/share-links`, `/project-share-links/:id`)

Projeyi Projelio hesabı OLMAYAN kişilere gösteren salt okunur bağlantılar
(bkz. migration 073, `modules/project-shares/`). Link oluşturma/kapatma yetkisi
proje düzenleme yetkisiyle aynıdır: proje sahibi ya da bağlı olduğu işin sahibi.

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/projects/:projectId/share-links` | Projenin linklerini listele | — |
| POST | `/projects/:projectId/share-links` | Yeni link üret | `{ label?, visibility, expiresInDays? }` |
| PATCH | `/project-share-links/:id` | Görünürlük/etiket/süre değiştir (token AYNI kalır) | `{ label?, visibility?, expiresInDays? }` |
| DELETE | `/project-share-links/:id` | Linki kapat (satır silinmez, `revoked_at` damgalanır) | — |

`visibility`: `{ tasks, outputs, team, feed, files, budget }` — hepsi boolean ve
**varsayılan `false`**. Gövdede açıkça `true` yazmayan bölüm kapalı sayılır
(bkz. `normalizeShareVisibility`); özet (ad, durum, tarihler, ilerleme yüzdesi)
her linkte vardır ve kapatılamaz.

### Kimlik doğrulaması gerektirmeyen uç

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/public/projects/:token` | Linkin açtığı görünüm (`PublicProjectView`) | — |

Uygulamadaki **tek** kimliksiz uç budur. `Authorization` header'ı beklemez,
gönderilirse yok sayar. Token yok / link kapatılmış / süresi dolmuş / proje
arşivlenmiş durumlarının hepsi ayrımsız **404** döner — farklı yanıtlar linkin
bir zamanlar var olduğunu sızdırırdı. IP başına dakikada 60 istekle sınırlıdır
(`ShareRateLimitGuard`).

Yanıtta kapalı bölümler alan olarak **hiç bulunmaz** (boş dizi değil). E-posta,
kullanıcı adı, ücret, kullanıcı kimlikleri ve dosya indirme bağlantıları hiçbir
koşulda dönmez.

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

## AI Kredileri (`/ai`)

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/ai/credits` | Kendi bakiyen | — |
| GET | `/ai/credits/transactions` | Kendi kredi hareketlerin | — |
| GET | `/ai/credit-packages` | Satılan paketler + `paymentConfigured` | — |
| GET | `/ai/credit-orders` | Kendi kredi siparişlerin | — |
| POST | `/ai/credit-orders` | Sipariş açar (**kredi YÜKLEMEZ**) | `{ packageKey }` |
| POST | `/ai/credit-orders/:id/cancel` | Kendi bekleyen siparişini iptal eder | — |
| GET | `/ai/admin/credit-orders` | Tüm siparişler (`?status=`) | — |
| POST | `/ai/admin/credit-orders/:id/mark-paid` | Ödemeyi onaylar → krediyi yükler | `{ reference?, note? }` |
| POST | `/ai/admin/credit-orders/:id/retry-credit` | "Ödendi ama yüklenmedi" durumunu yeniden dener | — |

Sipariş fiyatı ve kredi miktarı **istemciden alınmaz**; yalnızca `packageKey`
gönderilir ve değerler sunucudaki katalogdan (`ai-credits.config.ts`
`CREDIT_PACKAGES`) yazılır.

**Ödeme sağlayıcısı henüz bağlı değil** (bkz. `ai-payment.provider.ts`). Sipariş
`pending_payment` doğar; krediyi bakiyeye geçiren tek yol `mark-paid`'dir ve o da
admin'e kapalıdır. Sipariş kaydının varlığı ödeme sayılmaz — tek geçerli kanıt
`status = paid` **ve** `creditedAt` dolu olmasıdır.

## Sosyal medya hesap şifreleri (`/social-credentials`)

Sosyal hesapların giriş bilgileri. Değerler veritabanında AES-256-GCM ile şifreli
durur (anahtar: `SOCIAL_CREDENTIAL_ENC_KEY`, jeton anahtarından ayrı) ve
**yalnızca** `reveal` ucundan çözülmüş olarak çıkar — listeleme uçları sır
döndürmez.

Görme hakkı sırası (bkz. `social-credential-access.ts`): yönetici (organizasyon
sahibi / departman yöneticisi / modül yöneticisi) → şifreyi giren kişi → yönetici
tarafından izin verilmiş modül üyesi. Modülü okuyabilen diğer herkes yalnızca
kaydın *varlığını* görür.

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/social-accounts/:accountId/credentials` | Hesabın giriş kayıtları (sırsız) + `canManage`/`canCreate` | — |
| POST | `/social-accounts/:accountId/credentials` | Yeni giriş ekler | `{ label?, username?, password, note? }` |
| PATCH | `/social-credentials/:id` | Günceller; `password` boşsa şifreye dokunulmaz | `{ label?, username?, password?, note? }` |
| DELETE | `/social-credentials/:id` | Kaydı siler (arşivlemez) | — |
| POST | `/social-credentials/:id/reveal` | Şifreyi çözer, `Cache-Control: no-store` döner ve **denetim izine yazar** | `{}` |
| GET | `/social-credentials/:id/grants` | İzin listesi (yalnızca yönetici) | — |
| POST | `/social-credentials/:id/grants` | Modül ekibindeki bir kişiye izin verir | `{ userId, expiresAt? }` |
| DELETE | `/social-credential-grants/:id` | İzni geri alır (satır silinmez) | — |
| GET | `/social-credentials/:id/views` | Şifreyi kim, ne zaman gördü (yalnızca yönetici) | — |

İzin yalnızca **modül ekibine** (`module_members`, `pd_sosyal_medya`, `approved`)
verilebilir; departmanı görebildiği için modülü okuyabilen ama modüle atanmamış
kişiye izin verilmez.

## WhatsApp köprüsü (`/whatsapp`, `/admin/whatsapp`)

Havuz modeli (tasarım `docs/whatsapp-qr-plan.md` §12): numaralar Projelio'nun,
yöneticiler havuza ekler, her kullanıcıya ilk ihtiyaçta kalıcı bir numara
atanır; bildirimler ve Lio'nun müşteri yazışmaları o numaradan gider.
Numaralar yanıtlarda maskelidir.

| Method | Path | Açıklama | Body |
|---|---|---|---|
| GET | `/whatsapp/me` | Yapılandırılmış mı, havuz hazır mı, bana atanmış numara, kendi opt-in durumum (`WhatsappOverview`) | — |
| POST | `/whatsapp/me/link-code` | Eşleştirme kodu (`PROJELIO-XXXX`, 24 saat). Gerekiyorsa önce havuzdan numara atanır; kullanıcı kodu o numaraya gönderir | — |
| POST | `/whatsapp/me/opt-out` | WhatsApp bildirimlerini durdurur | — |
| GET | `/whatsapp/threads` | Kullanıcının müşteri konuşmaları (`WhatsappThread[]`) | — |
| POST | `/whatsapp/threads` | Müşteriyle konuşma açar/bulur; `{ id }` döner | `{ partyId? , phone?, displayName? }` |
| GET | `/whatsapp/threads/:id/messages?limit=` | Konuşma mesajları (sahibi, konuşmanın organizasyonunu görebilen ya da admin) | — |
| POST | `/whatsapp/threads/:id/messages` | Serbest metni kuyruğa alır; gönderim dakikalık işleyicide, hız sınırıyla | `{ body }` |
| PATCH | `/whatsapp/threads/:id/auto-reply` | Lio bu konuşmada müşteriye kendi yanıtlasın mı | `{ enabled }` |
| GET | `/admin/whatsapp/numbers` | **admin** — havuzdaki numaralar ve atanmış kullanıcı sayıları | — |
| POST | `/admin/whatsapp/numbers` | **admin** — havuza numara ekler, QR bekleyen oturumu açar | `{ label }` |
| POST | `/admin/whatsapp/numbers/:id/start` | **admin** — durmuş/kopmuş numarayı yeniden bağlamaya açar | — |
| GET | `/admin/whatsapp/numbers/:id/qr` | **admin** — QR, JSON içinde data-URL `{ qr }` | — |
| POST | `/admin/whatsapp/numbers/:id/pairing-code` | **admin** — telefon numarasıyla eşleştirme kodu `{ code }` | `{ phone }` |
| POST | `/admin/whatsapp/numbers/:id/logout` | **admin** — numarayı ayırır; satır ve atamalar kalır | — |
| DELETE | `/admin/whatsapp/numbers/:id` | **admin** — havuzdan çıkarır; atanmış kullanıcılar başka bağlı numaraya taşınır | — |
| POST | `/whatsapp/webhook` | **JWT yok.** WAHA'nın olay bildirimi; `X-Webhook-Hmac` (sha512, ham gövde) doğrulanır, olay saklanıp hemen 200 dönülür | WAHA zarfı |

Gelen mesaj yönlendirmesi: gönderen bir Projelio kullanıcısının telefonuysa
yalnızca komutlar tanınır (eşleştirme kodu, `DUR`, `BAŞLAT`); değilse müşteri
sayılır — konuşmanın sahibine `whatsapp_inbound` bildirimi gider, Lio otomatik
yanıt açıksa Lio cevaplar, sahipsiz konuşmada tüm yöneticilere bildirim gider.

Lio araçları: `whatsapp_search_customers`, `whatsapp_send_message` (onaylı),
`whatsapp_list_conversations`, `whatsapp_read_conversation`,
`whatsapp_set_auto_reply` (onaylı). Bkz. `ai-assistant.tools.ts`.

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
| `whatsapp-status` | `WhatsappStatusEvent` | WhatsApp bağlantı durumu değişti (QR okutuldu, koptu, numara eşlendi); Ayarlar kartı kendini tazeler |

Bildirim tipleri: `task_due_24h`, `task_due_1h`, `project_deadline_24h`,
`team_invite`, `role_updated`, `budget_changed`, `join_request`.

Deadline hatırlatmaları `DeadlineReminderProcessor` (BullMQ/CRON, `@nestjs/schedule`)
tarafından saatlik kontrol edilir ve eşik aşıldığında `NotificationsService.notifyUser`
üzerinden hem Socket.io hem FCM (mobil push) ile iletilir.
