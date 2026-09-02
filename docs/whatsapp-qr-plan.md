# WhatsApp Entegrasyonu — QR ile Bağlanan Numara (Uygulama Planı)

Durum: **canlıda**; 2026-09-03'te havuz modeline geçildi (§12). Sunucu adımları için §9.
Karar: bu iş için **ayrı bir numara** kullanılacak (şahsi numara değil).

Bu doküman `docs/whatsapp-mvp-spec.md`'deki Meta Cloud API yaklaşımının yerini
alır. Yön değişikliğinin nedeni: Cloud API bir WhatsApp Business hesabı, Meta
onaylı template'ler ve ücretli konuşma başına faturalama ister; istenen şey ise
**elimizdeki bir numarayı sunucuda QR okutarak bağlamak** ve hemen mesajlaşmaya
başlamak. Bu, WhatsApp'ın "Bağlı Cihazlar" (multi-device) protokolünü kullanan
resmi olmayan yoldur. Eski spec'teki veri modeli ve kuyruk/idempotency
tasarımı büyük ölçüde korunur; template ve 24 saat penceresi kavramları düşer.

---

## 0. Önce bilinmesi gerekenler (risk)

Resmi olmayan istemciler WhatsApp Hizmet Şartları'na aykırıdır. Sonuçları:

- **Ban kalıcıdır, itiraz yolu yoktur.** Numara bir daha WhatsApp'a alınmaz.
- 2026'da WhatsApp sunucu tarafında yeni kısıtlar getirdi: tanımadığı kişilere
  mesaj atınca `463 reachout timelock`, çok mesaj atınca `475 message capping`.
  Oturum sağlıklı görünürken gönderim sessizce bloklanır.
- Android 2.26.35 (Eylül 2026) ile uygulama içinde "resmi olmayan web istemcisi
  bağlı" uyarısı çıkıyor; tespit sunucu tarafında zaten aktif.
- Tetikleyiciler: düşük cevap oranı, rehberde olmayan kişilere yazmak, robotik
  zamanlama, sık bağlan/kop döngüsü (çöken bot), 30 günlük "cevapsız mesaj"
  sayacı.

**Tavsiye:** şahsi numara yerine bu iş için alınmış **ayrı bir numara** (yine
QR ile, aynı akış). Şahsi numarayla gidilecekse bu doküman yine geçerlidir;
sadece kaybedilecek şey daha değerlidir. Karar üstte verilir, plan iki
durumda da aynıdır.

Ban riskini düşüren tasarım kararları bu planın içine gömülüdür (§6): kişi önce
bize yazar, ısınma merdiveni, oran sınırı, jitter, 463/475'te oturumu yeniden
başlatmamak.

---

## 1. Araç seçimi

Araştırma özeti (Eylül 2026 itibarıyla; kaynaklar §11):

| Araç | Biçim | Tarayıcı | RAM/oturum | Lisans | Durum |
|---|---|---|---|---|---|
| **WAHA** (devlikeapro/waha) | Docker HTTP | motora bağlı | ~200 MB (GOWS/NOWEB) | Apache-2.0, **tüm özellikler ücretsiz** (2026.6'dan beri) | 2026.8.2, çok aktif |
| Baileys | npm | yok | ~150 MB | MIT (+GPL libsignal) | 7.0.0-rc14, bir yıldır RC |
| GOWA (whatsmeow) | Docker HTTP | yok | <200 MB | MIT/MPL | 9.3.0, tek bakımcı |
| Evolution API | Docker HTTP | yok | ≥2 GB (Postgres+Redis) | Apache + **lisans aktivasyonu zorunlu** | 2.4.0-rc2 |
| whatsapp-web.js | npm | Chromium | 400 MB+ | Apache-2.0 | 1.34.7 |
| WPPConnect | npm/Docker | Chromium | 400 MB+ | LGPL/Apache | 2.10.16 |

**Seçim: WAHA, Docker yan-servisi olarak, `GOWS` motoruyla (`NOWEB` yedek).**

Gerekçe:

- Protokol katmanı (kırılgan, ban'a açık, sık değişen) backend sürecinden
  ayrılır. WhatsApp protokolü değişince backend çökmez; güncelleme imaj
  sürümü yükseltmekten ibarettir.
- Oturum bilgisi mevcut Postgres'e yazılabilir (`WHATSAPP_SESSIONS_POSTGRESQL_URL`)
  → ekstra volume ve yedekleme yükü yok.
- HMAC imzalı, tekrar denemeli webhook; QR ve eşleştirme kodu uçları hazır;
  `/capping` ve `/timelock` uçları WhatsApp'ın yeni kotalarını gösteriyor;
  Prometheus metrikleri var.
- Motor değiştirmek (`WHATSAPP_DEFAULT_ENGINE`) entegrasyonu değiştirmez.
- NestJS tarafı bir HTTP istemci + bir webhook controller'dan ibaret kalır.

Baileys yalnızca "ikinci konteyner kabul edilemez" denirse tercih edilir; o
durumda Postgres tabanlı özel auth-state yazmak gerekir (`useMultiFileAuthState`
üretim için değildir) ve her protokol kırılması backend kesintisi olur.

---

## 2. Mimari

```
[Web (Settings → WhatsApp kartı)]
        │ JWT  (QR görüntüle / durum / kişi / mesaj)
        ▼
[backend (NestJS)] ──HTTP (API key)──▶ [waha konteyneri] ──WS──▶ WhatsApp
        ▲                                     │
        └──── webhook (HMAC) ◀────────────────┘
        │
   [postgres]  ← waha oturum verisi (ayrı DB: waha) + projelio tabloları
        │
   [socket.io user:<id>]  → tarayıcıya canlı bağlantı durumu
```

- `waha` servisi yalnızca compose ağında; **port yayımlanmaz**, Caddy'de yolu
  yoktur. Backend `http://waha:3000` ile konuşur.
- Oturum adı = `org_<organizationId>`. MVP'de tek numara, ama WAHA çoklu
  oturumu desteklediği için organizasyon başına bir numara tasarımdan
  bedavaya gelir.
- Webhook hedefi `http://backend:3000/whatsapp/webhook`; olaylar
  `session.status`, `message`, `message.ack`, `message.reaction` (ileride).

---

## 3. Deploy değişiklikleri

`deploy/docker-compose.prod.yml` içindeki `waha` servisi (gerekçeler yorum
olarak dosyada): imaj `devlikeapro/waha:gows-2026.8.2` sabit (etiketler motor bazlı, düz sürüm etiketi yok); motor `GOWS`; oturum
deposu Postgres (`waha` rolü/DB); `WHATSAPP_RESTART_ALL_SESSIONS=true`;
webhook ayarı env'de DEĞİL — backend oturumu açarken adres, olay listesi ve
HMAC anahtarını oturum konfigürasyonuyla verir (`waha.client.ts
ensureSessionStarted`); port yayımlanmaz; log boyutu sınırlı; sağlık kontrolü
`/ping`. Backend'e compose'dan `WAHA_URL` ve `WHATSAPP_WEBHOOK_URL` sabit verilir.
Yeni env değişkenleri (`deploy/.env.prod.example` + `.env`):

| Değişken | Nerede | Açıklama |
|---|---|---|
| `WAHA_API_KEY` | waha + backend | Backend → WAHA kimliği |
| `WAHA_WEBHOOK_HMAC` | waha + backend | Webhook imza anahtarı |
| `WAHA_DB_PASSWORD` | waha | Postgres `waha` rolü |
| `WAHA_URL` | backend | `http://waha:3000` |
| `WHATSAPP_WEBHOOK_URL` | backend (compose'da sabit) | WAHA'nın backend'e ulaşacağı adres: `http://backend:3000/whatsapp/webhook` |
| `WHATSAPP_RATE_*`, `WHATSAPP_WARMUP_*`, `WHATSAPP_QUIET_*` | backend, opsiyonel | Hız sınırı ayarları; varsayılanlar `whatsapp-rate-limit.ts` |

Postgres rolü + veritabanı + env sırları: `deploy/whatsapp-kur.sh` (sunucuda,
bir kez, tekrar koşulabilir). Betik `.env`'e eksik sırları üretip ekler,
`waha` rolünü CREATEDB yetkisiyle açar (WAHA oturum başına DB oluşturur).

`deploy/yedekle.sh`: `waha%` ile başlayan her veritabanı ayrıca dump'lanıyor
(1b adımı). Alınmazsa felaket durumunda numara yeniden QR okutularak bağlanır —
veri kaybı yok, sadece yeniden bağlama gerekir; mesaj geçmişi zaten projelio
tablolarında.

VPS kontrolü: `free -m` ile 300–500 MB boş RAM olduğundan emin ol.

**İlk açılışta doğrulanacak (belirsiz nokta):** WAHA dokümanı GOWS motorunun
Postgres oturum deposunu desteklediğini motor tablosunda söylüyor ama depolama
sayfasının ifadesi tutarsız. Konteyner kalktıktan sonra
`docker exec projelio-postgres sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -Atc "select datname from pg_database where datname like '"'"'waha%'"'"'"'`
ile `waha_*` veritabanlarının açıldığı görülmeli. Açılmıyorsa compose'da
`WHATSAPP_SESSIONS_POSTGRESQL_URL` satırı kaldırılıp
`/srv/projelio/data/waha:/app/.sessions` bind mount'u eklenir ve `yedekle.sh`'ye
o klasör için bir tar satırı yazılır.

Dağıtım zinciri (`npm run yayinla`) compose değişikliğini kendiliğinden alır;
yeni imaj ilk `docker compose up -d`'de çekilir.

**İlk canlıya almadan öğrenilenler (2026-09-02):**

- `.env`'e değişken eklemek `env_file: .env` kullanan HER servisi (Postgres
  dahil) yeniden oluşturur — compose env değişimini konfigürasyon değişimi
  sayar. `whatsapp-kur.sh` üç değişken ekleyince Postgres, storage, PostgREST,
  backend ve landing aynı anda yeniden başladı. Bir dahaki sefere yeni sırları
  `.env`'e eklemeden önce kısa bir kesintiye hazır ol; kalıcı çözüm WAHA
  sırlarını `env_file` yerine ilgili servislerin `environment` bloğuna vermek.
- Sunucu diski yavaş: 853 MB imaj yaklaşık 200 KB/s ile bir saatte indi;
  imaj açılırken ve `docker compose build` koşarken I/O baskısı %70'i aştı,
  backend modülleri saniyeler süren yüklemelerle açılamadı ve sağlık
  kontrolü zaman aşımına uğradı (Caddy o yüzden başlatılmadı, elle
  `docker start projelio-caddy` gerekti). WAHA'nın GOWS motoru da aynı
  nedenle "did not start after 10000 ms" diye birkaç kez yeniden başladı;
  yük düşünce kendiliğinden kalktı.
- WAHA Postgres URL'sinde `?sslmode=disable` şart (aksi hâlde "The server
  does not support SSL connections" ile döngü).
- İmaj etiketleri motor bazlı: `gows-<sürüm>`; düz `<sürüm>` etiketi yok.
- GOWS + Postgres oturum deposu ÇALIŞIYOR: ilk açılışta `waha_gows`
  veritabanı kendiliğinden açıldı. Yukarıdaki "belirsiz nokta" kapandı.

---

## 4. Veritabanı — `database/migrations/080_whatsapp.sql`

Eski spec'in tabloları temel alınır; farklar işaretli.

- **`whatsapp_connections`** — `organization_id`, `session_name` (unique),
  `phone_e164` (bağlanınca WAHA'dan gelir, önce null), `status`
  (`stopped | starting | scan_qr | working | failed`), `engine`,
  `linked_by_user_id`, `last_connected_at`, `last_status_at`,
  `warmup_started_at` (ısınma merdiveni için), `paused_until` + `pause_reason`
  (463/475 geldiğinde), `is_active`. *Cloud API'ye özgü `phone_number_id`,
  `waba_id`, `access_token_enc` düşer.*
- **`whatsapp_contacts`** — spec'teki gibi: `organization_id`, `phone_e164`,
  `display_name`, `user_id`, `opt_in_state`, `opt_in_source`, `opt_in_at`,
  `opt_out_at`. Ek: `link_code` (kullanıcı eşleştirme kodu, §5.3),
  `link_code_expires_at`, `wa_jid` (`905321234567@c.us`).
- **`whatsapp_threads`** — `connection_id`, `contact_id`, `last_inbound_at`,
  `last_outbound_at`, `last_message_at`, `human_handoff_at`. *`window_expires_at`
  düşer (24 saat penceresi yok).*
- **`whatsapp_messages`** — `thread_id`, `direction`, `wa_message_id` (WAHA
  `id`), `body`, `status` (`queued | sending | sent | delivered | read | failed | received`),
  `error_code`, `error_detail`, `dedupe_key` (unique), `attempt_count`,
  `next_attempt_at`, `notification_id` (hangi bildirimden doğdu; null olabilir),
  `sent_at/delivered_at/read_at/created_at`. *`message_type`/`template_*` düşer;
  `media_*` sonraki faz.*
- **`whatsapp_webhook_events`** — `event_id` (unique, WAHA `id`), `session_name`,
  `event`, `payload jsonb`, `received_at`, `processed_at`, `error`. Ham olay
  önce buraya yazılır, `200` dönülür, işleme ayrı adımda yapılır (aynı olay
  iki kez gelirse unique kısıt düşürür).

RLS açık, politika yok; erişim service_role + servis katmanı (repo konvansiyonu,
bkz. `076_sosyal_hesap_kimlik_bilgileri.sql` başlığı).

Migration **elle uygulanır** (bkz. `CLAUDE.md`), ardından
`notify pgrst, 'reload schema'`.

---

## 5. Backend modülü — `backend/src/modules/whatsapp/`

Dosya bölümlemesi (küçük, tek sorumluluklu; saf mantık ayrı ve testli):

| Dosya | Sorumluluk |
|---|---|
| `whatsapp.module.ts` | Modül; `WhatsappService`'i dışa açar. `NotificationsModule` ile döngüsel bağımlılık → `forwardRef` (bkz. §5.4). |
| `whatsapp.controller.ts` | JWT'li uçlar (bağlantı, QR, kişiler, mesajlar). |
| `whatsapp-webhook.controller.ts` | Yalnız `POST /whatsapp/webhook`; JWT yok, HMAC var; ham gövde. |
| `whatsapp.service.ts` | Bağlantı yaşam döngüsü, kişi/thread yönetimi, giden mesaj kuyruğa alma. |
| `waha.client.ts` | WAHA HTTP çağrıları (`sessions`, `auth/qr`, `sendText`, `sendSeen`, `startTyping`, `capping`, `timelock`). Tek dış çıkış; testte taklit edilir. |
| `whatsapp-webhook.service.ts` | Ham olayı çözer: `session.status` → bağlantı durumu; `message` → gelen mesaj; `message.ack` → teslimat. HMAC doğrulama yardımcıları (saf). |
| `whatsapp-send.processor.ts` | `@Cron("* * * * *")`: `queued` ve `next_attempt_at <= now()` satırları alır, oran sınırına uyarak gönderir, sonucu yazar. Repo'da BullMQ **kullanılmıyor** (bağımlılık var ama import yok, Redis yok); `deadline-reminder.processor.ts` deseni izlenir. |
| `whatsapp-rate-limit.ts` | Saf: ısınma merdiveni + dakika/saat/gün limitleri + jitter hesabı. |
| `whatsapp-optin.ts` | Saf: gelen metinden opt-in/opt-out/eşleştirme kodu çıkarımı (`DUR`, `BAŞLAT`, `PROJELIO-XXXX`). |
| `whatsapp-phone.ts` | Saf: E.164 normalizasyonu, `jid ↔ e164` dönüşümü. |
| `whatsapp-access.ts` | Saf: "bu kullanıcı bağlantıyı yönetebilir/görebilir mi" (`social-credential-access.ts` deseni). |
| `whatsapp-webhook-signature.ts` | Saf: HMAC doğrulama (sabit zamanlı karşılaştırma). |
| `whatsapp-notification-types.ts` | Hangi bildirim tipleri WhatsApp'a gider + metin biçimi. |

### 5.1 Uçlar

Uygulanan uçların tam listesi ve gövdeleri `docs/api-endpoints.md` "WhatsApp
köprüsü" bölümünde. Özet:

| Metod | Yol | Yetki | Özet |
|---|---|---|---|
| `GET` | `/whatsapp/me` | JWT | Yapılandırılmış mı + organizasyon başına bağlantı özeti ve kendi opt-in durumum (Ayarlar kartının tek çağrısı) |
| `POST` | `/whatsapp/me/link-code` | JWT + org görebilir | Eşleştirme kodu + `wa.me` bağlantısı (§5.3) |
| `POST` | `/whatsapp/me/opt-out` | JWT | Kendi bildirimimi durdur |
| `POST` | `/organizations/:orgId/whatsapp/connection/start` | JWT + org sahibi | WAHA oturumunu aç; `starting` → `scan_qr` |
| `GET` | `/organizations/:orgId/whatsapp/connection/qr` | Aynı | `{ qr }` data-URL; bağlıysa 409 |
| `POST` | `/organizations/:orgId/whatsapp/connection/pairing-code` | Aynı | `{ phone }` → `{ code }` |
| `POST` | `/organizations/:orgId/whatsapp/connection/logout` | Aynı | Numarayı ayır; satır kalır, durum `stopped` |
| `GET` | `/organizations/:orgId/whatsapp/contacts` | Aynı | Kişi listesi (maskeli) |
| `GET` | `/whatsapp/threads/:id/messages` | Aynı | Konuşma mesajları |
| `POST` | `/whatsapp/threads/:id/messages` | Aynı | `{ body }` → kuyruğa |
| `POST` | `/whatsapp/webhook` | HMAC | Ham olayı sakla, hemen `200`, arkada işle |

Yönetim yetkisi: yalnızca **organizasyon sahibi** (`whatsapp-access.ts`) — QR'ı
okutan kişi numaranın tüm sohbetlerine erişir; departman yöneticiliği yetmez.

### 5.2 Bağlantı yaşam döngüsü

1. Yönetici "Bağla" → `start`: WAHA `POST /api/sessions` (`name: org_<id>`,
   webhook config env'den geliyor). Satır `starting`.
2. WAHA `session.status: SCAN_QR_CODE` webhook'u → satır `scan_qr`, socket ile
   `user:<linkedBy>` odasına `whatsapp-status` olayı.
3. Web QR uç noktasını 15 sn'de bir yeniler (QR'ın kendisi socket ile
   gönderilmez; görsel proxy daha basit ve güvenli).
4. `WORKING` → satır `working`, `phone_e164` WAHA `me` alanından, `warmup_started_at`
   ilk kez set edilir. UI "Bağlı: +90 5xx ••• 67".
5. `FAILED` / `STOPPED` → satır güncellenir; **yeniden başlatma yok**, sadece UI'da
   "Yeniden bağla" düğmesi. (Otomatik bağlan/kop döngüsü ban tetikleyicisidir.)

### 5.3 Kişi eşleme ve opt-in ("önce sen yaz" akışı)

Yeni kişiye ilk mesajı **bizim** atmamız hem 463 timelock'a takılır hem ban
riskidir. Bu yüzden akış tersine kurulur:

1. Kullanıcı Ayarlar → WhatsApp → "Bildirimleri WhatsApp'tan al" der.
2. Backend `link_code` üretir (`PROJELIO-4F7K`, 24 saat geçerli) ve
   `https://wa.me/<orgNumarası>?text=PROJELIO-4F7K` bağlantısı/QR'ı gösterir.
3. Kullanıcı telefonundan mesajı gönderir. Webhook → `whatsapp-optin.ts` kodu
   tanır → kişi oluşturulur/`user_id` bağlanır, `opt_in_state = opted_in`,
   `opt_in_source = link_code`. Otomatik yanıt: "Bağlandı, bildirimler buradan
   gelecek. Durdurmak için DUR yaz."
4. `DUR` → `opted_out`, tek satır onay. `BAŞLAT` → tekrar `opted_in`.

Dış kişiler (müşteri, taşeron) yönetici tarafından eklenir ama gönderim yine
yalnızca kişi bize bir kez yazdıktan sonra (`last_inbound_at` dolu) yapılır.

### 5.4 Bildirim kanalı

`notifications.service.ts` `notifyUser` şu an DB + socket + web-push yapıyor
(satır 48-58). Dördüncü adım: `void this.whatsapp.notifyUser(userId, notificationRow)`.

- `WhatsappService.notifyUser`: kullanıcının `opted_in` kişisi ve org'unun
  `working` bağlantısı varsa `whatsapp_messages`'a `queued` satır ekler,
  `dedupe_key = notification:<id>`. Yoksa sessizce döner.
- Metin: `title` + `body` + kısa link (mevcut `link` alanı `WEB_APP_URL` ile
  mutlaklaştırılır). Bildirim tipi başına özel metin **yok** (MVP).
- Hangi tipler gider: `task_due_*`, `task_reminder`, `project_deadline_24h`,
  `team_invite`, `job_invite*`, mention/comment. `daily_digest`/`weekly_digest`
  gitmez (uzun, günlük kotayı yer). Liste `whatsapp-notification-types.ts`'te
  saf bir `Set`.
- Döngüsel bağımlılık: Notifications → Whatsapp (kanal) ve Whatsapp →
  NotificationsGateway (durum push'u). Çözüm: `forwardRef` ya da durum push'u
  için gateway'i doğrudan değil, `NotificationsModule`'ün dışa açtığı
  `NotificationsGateway`'i `forwardRef(() => NotificationsModule)` ile almak.

### 5.5 Gönderim işleyicisi ve güvenilirlik

- Dakikada bir çalışır; bağlantı `working` ve `paused_until` geçmişse.
- Satırı `sending`'e çeker (`update ... where status='queued' returning`),
  jitter'lı bekleme (2–8 sn), `startTyping` → `sendText` → `stopTyping`.
- Başarı: `sent`, `wa_message_id`. `message.ack` webhook'u `delivered/read`'e
  yükseltir.
- Hata: `attempt_count++`, üstel geri çekilme (1, 5, 30 dk), 3 denemede `failed`.
- **463/475** yanıtı: mesaj `queued` kalır, bağlantı `paused_until = now()+6h`,
  `pause_reason` yazılır, oturuma dokunulmaz. Yönetici UI'da uyarı görür.
- Yeniden başlatılan sunucu eski kuyruğu boşaltmasın diye
  `deadline-reminder.processor.ts`'teki `MAX_LATE_MS` deseni: 6 saatten eski
  `queued` satırlar `failed(stale)` olur.

---

## 6. Ban riskini düşüren kurallar (`whatsapp-rate-limit.ts`)

| Kural | Değer (başlangıç, env ile ayarlanabilir) |
|---|---|
| Isınma merdiveni | 1. gün 20 mesaj, günlük ×1.8, 7. günde tavana ulaş |
| Tavan | 8/dk, 200/saat, 1500/gün (bağlantı başına) |
| Kişi başı | günde en fazla 20 bildirim; aynı görev için saatte 1 |
| Jitter | gönderimler arası 2–8 sn rastgele + yazıyor göstergesi |
| Sessiz saat | 22:00–08:00 Europe/Istanbul arasında kuyrukta bekle (acil tipler hariç, MVP'de hariç yok) |
| Yeni kişi | asla ilk mesajı biz atmayız (§5.3) |
| Oturum | 463/475/koptu → yeniden başlatma yok, insan kararı |

Hepsi saf fonksiyon; `node --test` ile tablo tabanlı test.

---

## 7. Web — `apps/web/`

- `src/api/whatsapp.ts` — `{ api }` istemcisiyle uçlar (dosya adı deseni:
  `socialCredentials.ts`).
- `src/components/WhatsappConnectionCard.tsx` — org yöneticisi görür: durum
  rozeti, "Bağla" → QR görseli (15 sn'de yenilenir) veya eşleştirme kodu,
  bağlıyken maskeli numara + "Bağlantıyı kes", duraklatma uyarısı.
- `src/components/WhatsappNotifyCard.tsx` — her kullanıcı görür: "WhatsApp'tan
  bildirim al" → `wa.me` bağlantısı + QR (kod içeren), durum
  (`bağlı değil / bağlı / durduruldu`), "Durdur".
- İkisi de `Settings.tsx` `baglantilar` sekmesine (satır 824-829,
  `GoogleDriveCard`/`OneDriveCard` yanına) eklenir. Org seçimi: kullanıcının
  yönetici olduğu org'lar için birer kart.
- Canlı durum: `NotificationsGateway`'in mevcut `user:<id>` odasından
  `whatsapp-status` olayı dinlenir (`src/lib/` altındaki mevcut socket hook'una
  bir olay eklenir).
- Renkler `packages/shared/src/theme.ts`'ten; WhatsApp yeşili **eklenmez**,
  `accent` kullanılır.
- Tipler `packages/shared/src/types.ts`: `WhatsappConnectionStatus`,
  `WhatsappConnectionSummary`, `WhatsappContact`, `WhatsappMessage`.

Sohbet ekranı MVP dışı (mesajlar API'de, UI ikinci faz).

---

## 8. Güvenlik

- WAHA'ya dışarıdan erişim yok; `WAHA_API_KEY` zorunlu; Caddy'de yol yok.
- Webhook: `X-Webhook-Hmac` (sha512) ham gövde üzerinde doğrulanır, aksi 401 ve
  hiçbir şey yazılmaz. `X-Webhook-Timestamp` 5 dk toleransı.
- Gelen WhatsApp metni **güvenilmez veridir**: yalnızca opt-in/eşleştirme
  komutları tanınır; Lio'ya iletilmez, görev oluşturmaz (MVP). Lio aracı
  ileride `CRITICAL_TOOLS` kapısıyla eklenir.
- Numaralar UI'da maskeli; loglara tam numara yazılmaz.
- QR görseli yalnızca org yöneticisine, yalnızca `scan_qr` durumunda.

---

## 9. Uygulama fazları

| Faz | İş | Çıktı / doğrulama |
|---|---|---|
| **0. Karar** ✅ | Ayrı numara; WAHA `gows-2026.8.2` sabitlendi | Bu doküman |
| **1. Altyapı** ✅ kod / ⏳ sunucu | compose `waha` servisi, env örnekleri, `whatsapp-kur.sh`, `yedekle.sh` 1b | Sunucuda: `deploy/whatsapp-kur.sh` koşulacak, ardından `npm run yayinla` |
| **2. Şema + çekirdek** ✅ kod / ⏳ migration | `080_whatsapp.sql`, modül, `waha.client.ts`, uçlar, webhook + HMAC | **Migration elle uygulanacak** (CLAUDE.md'deki komut) + `notify pgrst` |
| **3. Web bağlantı kartı** ✅ | `WhatsappCard` + `WhatsappConnectionPanel`, `whatsapp-status` soket olayı, `api/whatsapp.ts` | Canlıda QR okutulup `working` görülecek |
| **4. Gelen mesaj + opt-in** ✅ | webhook `message` işleme, kişi/thread, eşleştirme kodu, `WhatsappNotifyPanel`, otomatik yanıtlar | Canlıda telefondan kod → bağlanır, `DUR` çalışır |
| **5. Giden kanal** ✅ | `notifyUser` kancası, kuyruk, dakikalık işleyici, hız sınırı, ack | Canlıda görev atanınca WhatsApp'a düşer |
| **6. Operasyon** ⏳ | `docs/api-endpoints.md` ✅, README ✅; canlı doğrulama, ilk hafta ısınma takibi, `/capping` durumunu UI'da gösterme | `npm run yayinla` ile canlı |
| **Sonraki** | Medya (görsel/belge), sohbet ekranı, Lio "WhatsApp'a gönder" aracı, org başına çoklu numara | — |

Canlıya alma sırası (hepsi elle, bu sırayla):

1. `ssh projelio@100.111.242.24 'bash -s' < deploy/whatsapp-kur.sh` — sırlar + rol + DB.
   (Betik sunucudaki `/srv/projelio/deploy/.env`'i düzenler; repodaki kopya
   dağıtımla gittiğinde de `/srv/projelio/deploy/whatsapp-kur.sh` olarak koşar.)
2. Migration: `ssh projelio@100.111.242.24 'docker exec -i projelio-postgres sh -c "psql -v ON_ERROR_STOP=1 -U \$POSTGRES_USER -d \$POSTGRES_DB"' < database/migrations/080_whatsapp.sql`
   sonra `notify pgrst, 'reload schema'`.
3. `npm run yayinla` — compose `waha` servisini ve backend'i kaldırır.
4. Ayarlar › Bağlı hesaplar › WhatsApp › "Numara bağla" → QR okut.
5. Kendi hesabınla "Kod al" → gönder → bildirim testi (bir görev ata).

---

## 10. Test stratejisi

- Saf modüller (`rate-limit`, `optin`, `phone`, `access`, HMAC doğrulama)
  `node --test` ile, kaynağın yanında.
- `waha.client.ts` arayüz olarak tanımlanır; servis testlerinde sahte istemci.
- Webhook işleme: kayıtlı örnek payload'lar (`session.status`, `message`,
  `message.ack`) fixture olarak `whatsapp-webhook.service.test.ts` içinde.
- Canlı doğrulama: ayrı test numarasıyla, ısınma kurallarına uyarak.

---

## 11. Kaynaklar

- WAHA: https://github.com/devlikeapro/waha · 2026.6 (tüm özellikler ücretsiz): https://waha.devlike.pro/blog/waha-2026-6/ · oturum/QR/eşleştirme/capping: https://waha.devlike.pro/docs/how-to/sessions/ · depolama: https://waha.devlike.pro/docs/how-to/storages/ · motorlar: https://waha.devlike.pro/docs/how-to/engines/
- Baileys: https://github.com/WhiskeySockets/Baileys · 463 incelemesi: https://github.com/WhiskeySockets/Baileys/issues/2441 · ban dalgası: https://github.com/WhiskeySockets/Baileys/issues/1869
- GOWA: https://github.com/aldinokemal/go-whatsapp-web-multidevice · whatsmeow: https://pkg.go.dev/go.mau.fi/whatsmeow
- Evolution lisans: https://docs.evolutionfoundation.com.br/en/licensing
- WhatsApp ToS: https://www.whatsapp.com/legal/terms-of-service · resmi olmayan istemci uyarısı: https://www.aroged.com/2026/09/01/whatsapp-security-and-privacy-warning-for-users-using-unofficial-web-clients/ · yeni limitler: https://gulfnews.com/technology/new-whatsapp-limits-could-block-messages-to-people-who-dont-reply-1.500312721 · anti-ban pratikleri: https://github.com/kobie3717/baileys-antiban
- Manzara karşılaştırması: https://wasphere.com/blog/open-source-whatsapp-api-landscape-2026/

Not: ban süresi/eşik rakamları (2–8 hafta, günde 30–40 mesaj) resmi API satan
firmaların bloglarından geliyor; ölçüm değil, işaret olarak okunmalı.

---

## 12. Havuz modeli (2026-09-03)

İlk sürümde numara organizasyonun sahibince bağlanıyordu. İstek üzerine model
değişti (`081_whatsapp_havuz.sql`):

- **Numaralar Projelio'nun.** Yalnız platform yöneticisi (`users.role = admin`)
  Admin paneli › WhatsApp numaraları'ndan havuza numara ekler, QR okutur,
  koparır, havuzdan çıkarır. Organizasyon sahibi artık numara bağlamaz.
- **Kalıcı atama.** Her kullanıcıya ilk ihtiyaçta (kod alırken ya da Lio
  müşteriye yazarken) havuzdaki çalışan numaralardan en az yüklü olanı
  atanır (`whatsapp_user_numbers`) ve bir daha değişmez: müşteri hep aynı
  numarayı görür, kullanıcı için o numara "Projelio numaran"dır. Numara
  havuzdan çıkarılırsa kullanıcılar başka çalışan numaraya taşınır (tek
  istisna, bilinçli yönetici işlemi).
- **Kişi türü.** `whatsapp_contacts.kind`: `user` (kullanıcının kendi telefonu,
  bildirim alıcısı, opt-in şart) / `customer` (dış kişi, `party_id` bağı).
  Tekillik `(connection_id, phone_e164)`.
- **Konuşma türü.** `whatsapp_threads.kind`: `notification` / `customer`;
  `owner_user_id` konuşmayı başlatan; `organization_id` erişim kapsamı
  (party'nin organizasyonu; o organizasyonu görebilen herkes okuyabilir);
  `lio_auto_reply`.
- **Lio.** Beş araç (`whatsapp_*`, bkz. `docs/api-endpoints.md`); gönderme ve
  otomatik yanıtı açma `CRITICAL_TOOLS`'ta (onay ister). Otomatik yanıt:
  müşteriden her mesajda `AiAssistantService.draftText` ile konuşma geçmişine
  dayalı kısa yanıt üretilir, kuyruğa girer; kredi konuşma sahibinden düşer.
  Gelen metin güvenilmez girdidir; sistem istemi talimat uygulamamasını söyler.
- **Gelen yönlendirme.** Kullanıcı telefonu → komutlar; müşteri → sahibine
  `whatsapp_inbound` bildirimi (+ Lio açıksa yanıt); sahipsiz → yöneticilere.
- **Ban riski notu.** Müşteriye ilk mesajı biz atıyoruz (istek bu). "Kişi önce
  yazsın" kuralı yalnızca bildirim kanalında kaldı. 463/475 kısıtları ve
  ısınma merdiveni numara başına uygulanmaya devam ediyor; havuzda birden çok
  numara olması yükü dağıtır.
- **Sonraki adım (yapılmadı):** web'de konuşma ekranı (şu an mesajlar yalnızca
  Lio ve API üzerinden okunuyor; bildirim Ayarlar'a yönlendiriyor).
