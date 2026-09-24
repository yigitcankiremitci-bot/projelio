# Google Takvim entegrasyonu

Kullanıcı kendi Google Takvim'ini bağlar: etkinlikleri Projelio takviminde
görünür, Projelio'dan Google'a etkinlik ve plan bloğu yazılır, Lio etkinlikleri
okuyup göreve çevirir.

| Ne | Nerede |
|---|---|
| Google API + eşleme (saf, testli) | `backend/src/modules/google-takvim/takvim-api.ts` |
| Bağlantı, eşitleme, yazma | `backend/src/modules/google-takvim/google-takvim.service.ts` |
| 15 dakikalık arka plan eşitlemesi | `google-takvim.processor.ts` |
| OAuth dönüşü | `google/google.controller.ts` (`mode: "takvim"`) |
| Blok taşınınca/silinince Google kopyası | `planning.service.ts` → `blokDegisti` / `blokSilinecek` |
| Lio araçları | `list_calendar_events`, `create_calendar_event`, `send_time_blocks_to_calendar`, `mark_calendar_event` |
| Ortak tipler + gün bölme | `packages/shared/src/googleTakvim.ts` |
| Ayarlar kartı, etkinlik penceresi | `apps/web/src/components/googleTakvim/` |
| Tablolar | migration 133 (`google_takvim_baglantilari`, `google_takvim_etkinlikleri`) |

## Nasıl çalışıyor

- **Bağlantı ayrı.** Giriş/Drive (`google_accounts`) ve demo Meet
  (`demo_sunuculari`) bağlantılarından bağımsız; kişi başka bir Google
  hesabının takvimini bağlayabilir.
- **Etkinlikler önbellekte.** Takvim sayfası önbellekten anında çizilir, sonra
  görünen aralık arka planda Google'dan tazelenir. Cron bağlı herkesin 7 gün
  geri / 60 gün ileri penceresini 15 dakikada bir tazeler. Anlık Google
  bildirimi (push channel) yok.
- **Google'dan gelen etkinlik salt okunur.** Projelio yalnızca kendi açtığı
  etkinlikleri düzenler/siler (`kaynak = 'projelio'`, Google'da
  `extendedProperties.private.projelio = "1"`).
- **Plan bloğunun sahibi Projelio.** "Google Takvim'e de ekle" denmiş blok
  taşınınca Google'daki kopya taşınır; Google'da taşımak bloğu oynatmaz. Görev
  silinince blok veritabanında `cascade` ile gider — o durumda Google kopyası
  kalır (bilinen boşluk).
- **Göreve çevirme Lio'da.** Etkinliğin hangi iş/projeye ait olduğunu, süresini,
  önceliğini Lio tahmin eder, önce önerir, onayla görevi açar ve etkinliği
  `mark_calendar_event` ile işaretler (`isleme`: yeni · gorev · yoksay).
- Hiçbir Google isteğinde davet gönderilmez (`sendUpdates=none`).

## Kurulum

Yeni ortam değişkeni yok: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_TOKEN_ENC_KEY` yeterli (Drive ile aynı).

1. Migration 133'ü uygula (`./deploy/migrate.sh uygula`).
2. Google Cloud Console → Calendar API açık olmalı (demo Meet için zaten açıldı).
3. OAuth onay ekranı (Google Auth Platform > Data Access) — ikisi de 2026-09-24'te eklendi:
   - `https://www.googleapis.com/auth/calendar.events` — hassas
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly` — hassas değil

## ⚠️ Herkese açmadan önce: Google doğrulaması

`calendar.events` Google'ın **hassas** sınıfında. Uygulama doğrulanmadan:
- en fazla 100 kullanıcı bağlanabilir,
- her kullanıcı "Google bu uygulamayı doğrulamadı" uyarısı görür.

Doğrulama için gerekenler:
- projelio.app'in Search Console'da doğrulanması (✓ 2026-09-24),
- gizlilik politikasına Google API **Limited Use** paragrafı
  (`apps/web/src/lib/legal/privacyPolicy.ts`, iki dil) — takvim verisinin
  Projelio sunucusunda önbelleğe alındığı ve Lio'ya (AI sağlayıcısına)
  gönderildiği açıkça yazılmalı,
- `calendar.events` için gerekçe metni (Data Access sayfasındaki "How will the
  scopes be used?" kutusu, şu an boş),
- OAuth akışını ve izinlerin kullanıldığı ekranları gösteren bir YouTube videosu.

KVKK notu: Lio Anthropic dışı bir sağlayıcıya düşerse (bkz. `AI_PROVIDERS`)
takvim içerikleri de oraya gider.

## Doğrulama başvurusu malzemeleri

### İzin gerekçesi

Google Auth Platform > Data Access > "How will the scopes be used?" kutusuna
(İngilizce, en fazla 1000 karakter):

```
Projelio is a project and task management app. Users can optionally connect their own Google Calendar in Settings > Connected accounts. We use calendar.events to (1) read events from the calendars the user selects and show them inside Projelio's planning calendar next to their tasks and time blocks, and (2) write events the user explicitly creates in Projelio (a time block or an event) to their own calendar, and update or delete only those Projelio-created events when the user moves or deletes them. Events created elsewhere are shown read-only. No guests are added and no invitations are sent (sendUpdates=none). The read-only calendar.readonly / calendar.events.readonly scopes are not sufficient because the user asks us to write events to their calendar. We do not use the broader calendar scope and never create, delete or share calendars. Data is used only for these user-facing features, never for advertising or AI model training.
```

### Demo videosu (YouTube, "liste dışı" yüklenebilir)

Google videonun şunları göstermesini istiyor: OAuth onay ekranı (uygulama adı
ve istenen izinler okunur hâlde), her iznin uygulamada nerede kullanıldığı.
Tarayıcı adres çubuğu görünür olmalı; OAuth adresindeki `client_id`
okunabilmeli. Yaklaşık 2 dakika, seslendirme gerekmez (İngilizce altyazı
yeterli).

1. `https://app.projelio.app` açık, giriş yapılmış. Ayarlar > Bağlı hesaplar >
   Google Takvim kartı > "Google Takvim'i bağla".
2. Google hesap seçimi → onay ekranı. Ekranda dur: "Projelio", istenen iki izin
   ("View and edit events…", "See the list of Google calendars…"). Adres
   çubuğundaki `client_id` görünsün. Onayla.
3. Projelio'ya dönüş → kartta bağlı hesap, takvim listesi (calendarlist izni),
   hedef takvim seçimi.
4. Takvim sayfası → Google etkinlikleri ızgarada (okuma). Bir etkinliğe tıkla:
   salt okunur ayrıntı.
5. "+ Etkinlik" ile bir etkinlik ekle → Google Takvim'i yan sekmede aç, etkinlik
   orada (yazma).
6. Bir zaman bloğu aç → "Google Takvim'e de ekle" → Google'da görün. Bloğu
   Projelio'da taşı → Google'da da taşındığını göster; bloğu sil → Google'dan da
   silindiğini göster (güncelleme/silme yalnızca Projelio'nun açtıklarında).
7. Ayarlar > "Bağlantıyı kes" → takvim Projelio'dan kalkar.

Google Cloud tarafı 2026-09-24'te tamamlandı: Branding'de ana sayfa, gizlilik ve
şartlar bağlantıları; yetkili alan adı yalnızca `projelio.app` (eski Netlify ve
Render adresleri OAuth istemcisinden ve listeden çıkarıldı); Data Access'te
yukarıdaki gerekçe kayıtlı.

Search Console: `projelio.app` alan adı mülkü 2026-09-24'te doğrulandı
(yigitcankiremitci@gmail.com; DNS GoDaddy'de, mevcut google-site-verification
TXT kaydıyla — o kayıtları SİLME).

Uygulama doğrulamasında ayrıca: gizlilik politikası bağlantısının onay ekranında
(Branding) çalışan bir adres olması — `https://projelio.app/en/legal/privacy` (`/privacy` 404 veriyor) ve politikanın Limited Use
paragrafını içermesi (§7, 2026-09-24).
