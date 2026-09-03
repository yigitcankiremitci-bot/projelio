# WhatsApp Köprüsü — Bildirim ve Müşteri Yazışması

> Entegrasyon notu: QR ile bağlanan numaralar üzerinden bildirim ve Lio'nun müşteri yazışması.
>
> Migration: `080_whatsapp.sql`, `081_whatsapp_havuz.sql`, `082_whatsapp_bekleyen_eslesme.sql` ·
> Kod: `backend/src/modules/whatsapp/` · Yan-servis: `deploy/docker-compose.prod.yml` → `waha` ·
> Web: `WhatsappCard`, `WhatsappProfileCard`, `WhatsappNumbersPanel` · Tasarım ve tarihçe: `docs/whatsapp-qr-plan.md`

---

## 1. Ne yapar

- **Bildirim kanalı.** Görev atama, son tarih, davet, yorum gibi bildirimler uygulama içi bildirime ek olarak kullanıcının WhatsApp'ına da gider (`whatsapp-notification-types.ts` listesindeki tipler; özetler ve beğeniler gitmez).
- **Lio müşteri yazışması.** Lio, kullanıcıya atanmış Projelio numarasından `party` kayıtlarındaki müşterilere mesaj atar, konuşmayı okur; istenirse bir konuşmada gelen her mesaja kendi yanıt verir.
- **Havuz modeli.** Numaralar Projelio'nun. Platform yöneticisi havuza numara ekler; her kullanıcıya ilk ihtiyaçta havuzdan bir numara **kalıcı** atanır. Müşteri hep aynı numarayı görür; kullanıcı için o numara "Projelio numaran"dır.

## 2. Neden resmi API değil

Meta Cloud API bir WhatsApp Business hesabı, onaylı mesaj şablonları ve konuşma başına ücret ister; elimizdeki numarayı QR okutup hemen kullanmak mümkün değildir. Bu köprü WhatsApp'ın "Bağlı Cihazlar" protokolünü konuşan **WAHA** yan-servisini kullanır (GOWS motoru, Docker, tüm özellikler ücretsiz, Apache-2.0). Araç karşılaştırması ve gerekçe `docs/whatsapp-qr-plan.md` §1'de.

**Bedeli:** resmi olmayan istemciler WhatsApp Hizmet Şartları'na aykırıdır; ban kalıcı ve itirazsızdır. Bu yüzden:

- Numaralar bu iş için ayrılmış numaralardır, şahsi numara kullanılmaz.
- Bildirim kanalında ilk mesajı **biz atmayız**: kullanıcı önce numaraya yazar (kod ya da EVET), sonra bildirim gider.
- Numara başına ısınma merdiveni (1. gün 20 mesaj, günde ×1.8, 7. günde tavan), tavanlar (8/dk, 200/saat, 1500/gün), kişi başı günde 20, gönderimler arası 2–8 sn rastgele bekleme, 22:00–08:00 sessiz saat (`whatsapp-rate-limit.ts`).
- WhatsApp'ın 463 (yeni kişiye yazma kilidi) / 475 (kapasite) kısıtları görülünce numara duraklatılır, oturum **yeniden başlatılmaz**; kopan oturum da otomatik değil, yönetici kararıyla bağlanır.

## 3. Kurulum

Sunucuda bir kez (`deploy/whatsapp-kur.sh`): `.env`'e `WAHA_API_KEY`, `WAHA_WEBHOOK_HMAC`, `WAHA_DB_PASSWORD` üretir, Postgres'te `waha` rolünü (CREATEDB) ve veritabanını açar. Compose'daki `waha` servisi dağıtımla gelir: port yayımlanmaz, Caddy'de yolu yoktur, backend ona `http://waha:3000` ile ulaşır, WAHA backend'e `http://backend:3000/whatsapp/webhook` adresine HMAC imzalı olay atar. Oturum anahtarları `waha_*` veritabanlarında durur; yedekleme betiği onları ayrıca döker.

> **`.env`'e değişken eklemek** `env_file: .env` kullanan her servisi (Postgres dahil) yeniden oluşturur. Kurulum betiğini çalıştırırken kısa bir kesinti bekle.

> **İmaj etiketi** motor bazlıdır: `devlikeapro/waha:gows-<sürüm>`. Düz sürüm etiketi yoktur.

Backend env: `WAHA_URL`, `WAHA_API_KEY`, `WAHA_WEBHOOK_HMAC`, `WHATSAPP_WEBHOOK_URL`; hepsi yoksa köprü kapalı sayılır, arayüzde "yapılandırılmamış" görünür, hiçbir cron çalışmaz. Hız sınırı ayarları `WHATSAPP_RATE_*`, `WHATSAPP_WARMUP_*`, `WHATSAPP_QUIET_*` ile değiştirilebilir (`backend/.env.example`).

## 4. Kullanım

**Yönetici — numara eklemek.** Admin paneli › WhatsApp numaraları › etiket yaz › "Numara ekle" › numaranın telefonunda WhatsApp › Bağlı cihazlar › Cihaz bağla ile QR'ı okut (QR 15 sn'de bir yenilenir; okutamıyorsan "kodla bağlan"). Bağlanınca maskeli numara ve atanmış kullanıcı sayısı görünür. "Bağlantıyı kes" numarayı ayırır, atamalar kalır; "Havuzdan çıkar" atanmış kullanıcıları başka çalışan numaraya taşır (başka numara yoksa reddedilir). Aynı sayfada "Bağlı kullanıcılar" tablosu kimin hangi numaraya bağlı olduğunu listeler.

**Kullanıcı — bildirim almak.** Ayarlar › Bağlı hesaplar › WhatsApp › "Kod al" (bu anda havuzdan numarası atanır) › "WhatsApp'ta gönder" bağlantısı telefonunda `PROJELIO-XXXX` mesajını hazır getirir › gönder. Sunucu kodu tanır, numarayı hesaba bağlar, "bağlandı" der. Komutlar: `DUR` durdurur, `BAŞLAT` yeniden açar. Ayarlar › Hesap › "WhatsApp numarası" doğrulanmış numarayı salt okunur gösterir; "Bağlantıyı kaldır" ile ayrılır.

**Kodsuz eşleşme.** Onboarding'de telefonunu girmiş bir kullanıcının telefonu Projelio numarasına herhangi bir şey yazarsa "Bu numara '<ad>' hesabının profil telefonuyla eşleşiyor, EVET yazın" denir; EVET ile bağlanır. Yalnızca **tek ve tam** eşleşmede sorulur.

**Lio ile müşteriye yazmak.** Sohbette "Ahmet Bey'e WhatsApp'tan yaz, teklif yarın gidiyor" de. Lio `whatsapp_search_customers` ile party kaydını bulur, `whatsapp_send_message` onay ister (kime, ne), onaylayınca kuyruğa girer ve birkaç dakika içinde gider. "Bu konuşmada otomatik yanıtı aç" dersen (`whatsapp_set_auto_reply`, onaylı) müşteriden gelen her mesaja Lio konuşma geçmişine bakarak kısa bir cevap yazar; kredi konuşma sahibinden düşer. `whatsapp_list_conversations` / `whatsapp_read_conversation` ile konuşmaları okur.

**Gelen müşteri mesajı.** Konuşmanın sahibine `whatsapp_inbound` bildirimi düşer (Lio otomatik yanıt açıksa yine bilgi amaçlı). Kimsenin başlatmadığı bir konuşmadan (müşteri ilk yazan) gelen mesaj tüm yöneticilere "sahipsiz konuşma" olarak bildirilir; ilk yazan sahiplenir.

## 5. İşleyiş (kod haritası)

| Dosya | Sorumluluk |
|---|---|
| `waha.client.ts` | WAHA HTTP istemcisi — tek dış çıkış (oturum, QR, eşleştirme kodu, sendText, typing, seen, LID çözümleme) |
| `whatsapp.service.ts` | Havuz yönetimi, kalıcı atama, kişi/konuşma/kuyruk, bildirim kanalı, müşteri konuşması açma, yetki |
| `whatsapp-webhook.controller.ts` / `-webhook.service.ts` | HMAC doğrulama, ham olayı saklayıp hemen 200; gelen mesaj yönlendirmesi (kullanıcı komutları / profil eşleşmesi / müşteri), teslimat durumu |
| `whatsapp-send.processor.ts` | Dakikalık kuyruk: hız sınırı, jitter, yazıyor göstergesi, tekrar deneme, 463/475'te duraklatma; 5 dakikada bir WAHA ile durum uzlaştırma |
| `whatsapp-lio.service.ts` | Lio araçlarının gerçekleştirimi ve otomatik yanıt (`AiAssistantService.draftText`, ModuleRef ile tembel) |
| `whatsapp-rate-limit.ts`, `-optin.ts`, `-phone.ts`, `-access.ts`, `-webhook-signature.ts`, `-notification-types.ts` | Saf mantık, hepsi `node --test` ile testli |
| `whatsapp.controller.ts` / `whatsapp-admin.controller.ts` | Kullanıcı uçları / yönetici uçları (`RolesGuard`, `@Roles("admin")`) |

Veri: `whatsapp_connections` (havuz), `whatsapp_user_numbers` (kalıcı atama), `whatsapp_contacts` (kind: user/customer, `party_id`, `pending_user_id`), `whatsapp_threads` (kind: notification/customer, sahip, organizasyon, `lio_auto_reply`), `whatsapp_messages` (`sent_by`: system/user/lio, teslimat), `whatsapp_link_codes`, `whatsapp_webhook_events` (ham olaylar, `event_id` unique → çift teslim zararsız). Uç listesi `docs/api-endpoints.md` "WhatsApp köprüsü".

Yetki: numara yönetimi yalnız `role=admin`; müşteri konuşmasını sahibi, konuşmanın organizasyonunu görebilen herkes ve admin okur. Lio ayrı bir kapı açmaz, kullanıcının kendi yetkisiyle geçer. Gelen WhatsApp metni güvenilmez girdidir: yalnızca dar komut kümesi tanınır, Lio'ya talimat olarak iletilmez; otomatik yanıtın sistem istemi de talimat uygulamamasını söyler.

## 6. Sorun giderme

| Belirti | Bak |
|---|---|
| Kart "yapılandırılmamış" diyor | Backend env'de dört `WAHA_*`/`WHATSAPP_*` değişkeni; `docker exec projelio-backend node -e "fetch('http://waha:3000/ping',{headers:{'X-Api-Key':process.env.WAHA_API_KEY}}).then(r=>console.log(r.status))"` |
| Numara "koptu" | `docker logs projelio-waha`; yönetici panelinden "Yeniden bağla" (otomatik değil, bilerek). WAHA `sslmode=disable` olmadan Postgres'e bağlanamaz |
| Bildirim gitmiyor | Kişi `opted_in` ve `last_inbound_at` dolu mu (ilk mesajı kullanıcı atmalı); numara `working` ve `paused_until` geçmiş mi; sessiz saat mi; `whatsapp_messages.status/error_detail` |
| "WhatsApp gönderimi kısıtladı" uyarısı | 463/475: `paused_until` dolana kadar kuyrukta bekler; oturumu yeniden başlatma. `GET /api/sessions/{ad}/timelock` ve `/capping` (WAHA) |
| Kod tanınmadı | Kod 24 saat geçerli, tek geçerli kod var, kullanıcıya atanmış numaraya gönderilmiş olmalı (başka numaraya gönderilen kod geçersiz) |
| Webhook 401 | `WAHA_WEBHOOK_HMAC` iki tarafta aynı mı; `main.ts` `rawBody: true` |
| Dağıtımda backend sağlıksız | Bu sunucunun diski yavaş; `start_period: 300s`. Ayrıca DI döngüsü için yerelde `node dist/main` ile açılış kontrolü (bkz. plan §12 dersleri) |

## 7. Bilinen sınırlar / sırada

- Web'de konuşma ekranı yok; mesajlar Lio ve API üzerinden. Gelen müşteri mesajı bildirimi Ayarlar'a yönlendiriyor.
- Medya (görsel, belge) gönderimi/alımı yok; gelen medya `[medya]` olarak kaydedilir.
- Grup mesajları yok sayılır.
- Tek WAHA konteyneri; numara sayısı arttıkça RAM ~200 MB/oturum.
