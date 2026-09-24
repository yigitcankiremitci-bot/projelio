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
3. OAuth onay ekranına şu izinleri ekle:
   - `https://www.googleapis.com/auth/calendar.events` (demo için zaten var)
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly` (YENİ)

## ⚠️ Herkese açmadan önce: Google doğrulaması

İki izin de Google'ın **hassas** sınıfında. Uygulama doğrulanmadan:
- en fazla 100 kullanıcı bağlanabilir,
- her kullanıcı "Google bu uygulamayı doğrulamadı" uyarısı görür.

Doğrulama için gerekenler:
- projelio.app'in Search Console'da doğrulanması,
- gizlilik politikasına Google API **Limited Use** paragrafı
  (`apps/web/src/lib/legal/privacyPolicy.ts`, iki dil) — takvim verisinin
  Projelio sunucusunda önbelleğe alındığı ve Lio'ya (AI sağlayıcısına)
  gönderildiği açıkça yazılmalı,
- her izin için gerekçe metni,
- OAuth akışını ve izinlerin kullanıldığı ekranları gösteren bir YouTube videosu.

KVKK notu: Lio Anthropic dışı bir sağlayıcıya düşerse (bkz. `AI_PROVIDERS`)
takvim içerikleri de oraya gider.
