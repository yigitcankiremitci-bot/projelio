# Mobil uygulama bildirimleri (Android, FCM)

## Sorun neydi

1.1.0 (versionCode 3) telefona **hiç sistem bildirimi** göndermiyordu. Uygulama
bir WebView kabuğu ve web'in bildirim yöntemi (service worker + VAPID,
`apps/web/src/push.ts`) Android WebView'de yok. Bildirimler yalnızca uygulama
açıkken çanın sayacına düşüyordu. Ayrıca Android 13+ için bildirim izni
manifestte beyan edilmemişti, bildirim kanalı ve bildirim ikonu da yoktu.

## Ne yapıldı (1.2.0, versionCode 4)

| Parça | Yer |
|---|---|
| FCM eklentisi | `@capacitor/push-notifications` (apps/mobile) |
| İzin, varsayılan ikon/renk/kanal | `android/app/src/main/AndroidManifest.xml` |
| Yüksek öncelikli bildirim kanalı | `MainActivity.java` `bildirimKanaliniOlustur` |
| Tek renk bildirim ikonu | `res/drawable-*/ic_stat_projelio.png` — `scripts/bildirim-ikonu-uret.py` |
| İzin isteme + cihaz kaydı + dokununca sayfayı açma | `apps/web/src/lib/mobilKabuk.ts`, `push.ts`, `App.tsx` |
| Çıkışta cihaz kaydını silme | `push.ts` `bildirimCihaziniBirak` (Ayarlar ve Navbar çıkışı) |
| Cihaz tablosu | `database/migrations/131_push_cihazlari.sql` |
| Gönderim (HTTP v1, SDK'sız) | `backend/src/modules/notifications/fcm.ts` |
| Uçlar | `POST /notifications/devices`, `POST /notifications/devices/remove` |

Mesajlar `priority: HIGH` (Doze'da bekletilmez), 24 saat TTL, uygulamanın
kanalı ve turuncu vurgu rengiyle gider. Uygulama açıkken de sistem bildirimi
gösterilir (`capacitor.config.ts` `presentationOptions`).

## Elle yapılacaklar (bir kez)

1. **Firebase projesi**: https://console.firebase.google.com → proje ekle
   (Google Analytics gerekmez). Play Console ile aynı Google hesabı olabilir.
2. **Android uygulaması ekle**: paket adı `app.projelio.mobile`. SHA-1
   isteğe bağlı (FCM için gerekmez). İnen `google-services.json` dosyasını
   `apps/mobile/android/app/` altına koy. Sır değil, repoya girebilir.
   Dosya yoksa yayın derlemesi bilerek DURUR.
3. **Servis hesabı anahtarı**: Proje ayarları → Hizmet hesapları →
   "Yeni özel anahtar oluştur". JSON'dan üç değeri sunucudaki `backend/.env`'e yaz:
   ```
   FCM_PROJECT_ID=<project_id>
   FCM_CLIENT_EMAIL=<client_email>
   FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
   Bu anahtar SIR — repoya ve sohbete girmez. Sonra backend'i yeniden başlat;
   açılış log'undaki "FCM_* tanımlı değil" uyarısı kaybolmalı.
4. **Migration 131**: `./deploy/migrate.sh uygula`.
5. **AAB**: `npm run android:aab --workspace @projelio/mobile` → Play'e yükle.

## Nasıl denenir

Telefonda uygulamaya giriş yap → izin penceresine "İzin ver" → uygulamayı
kapat → başka bir hesaptan o kişiye görev ata. Bildirim birkaç saniyede
gelmeli; dokununca görev açılmalı. Gelmezse: sunucu log'unda "FCM gönderimi
başarısız" satırı ve `select * from push_cihazlari` ile cihazın kaydı.

Xiaomi / Huawei / Oppo gibi üreticilerde pil tasarrufu uygulamayı
"kısıtlı" sayarsa bildirim gecikebilir; bu cihaz ayarıdır, koddan aşılamaz.
