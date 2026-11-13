# iOS uygulaması (App Store)

iOS kabuğu Android'dekiyle aynı mantıkta: `apps/web`'in derlenmiş hâli
Capacitor ile WKWebView'e gömülü. Proje `apps/mobile/ios/` altında
(`npx cap add ios` ile üretildi, Swift Package Manager kullanıyor, CocoaPods yok).

```bash
npm run ios:ac --workspace @projelio/mobile   # web'i derler, eşitler, Xcode'u açar
```

Xcode komut satırı araçları Command Line Tools'u gösteriyorsa bir kez:
`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`

## Kodda hazır olanlar

- Paket adı `app.projelio.mobile` (Android'le aynı), sürüm 1.8.0, iOS 15+.
- İkon ve açılış ekranı `apps/mobile/assets/`'ten üretildi
  (`npx @capacitor/assets generate --ios`). İkonda alfa kanalı yok (Apple şartı).
- Info.plist: mikrofon (sesli not), kamera ve fotoğraf izin metinleri; şifreleme
  beyanı (`ITSAppUsesNonExemptEncryption = false`, yalnızca HTTPS); dil tr/en.
- Bildirimler: Firebase Messaging (SPM) eklendi. `AppDelegate.swift` APNs
  anahtarını Firebase'e verip FCM anahtarını push eklentisine iletiyor — yani
  backend (`fcm.ts`) iPhone'a da aynı yoldan gönderiyor. FCM mesajına
  `apns.payload.aps.sound = "default"` eklendi; yoksa iPhone'da bildirim sessiz.
  `GoogleService-Info.plist` yoksa Firebase başlatılmaz, uygulama yine açılır.
- `App.entitlements`: `aps-environment` + `applinks:app.projelio.app`.
- Web tarafı (`lib/mobilKabuk.ts` `kabukPlatformu`): iPhone'da "Google Play"
  geçen metin/bağlantı gösterilmiyor (Apple 2.3.10). App Store kimliği
  (`APP_STORE_KIMLIGI`) boşken "değerlendir" kartı iPhone'da görünmez.
- Satın alma kabukta zaten gizli (`satinAlmaGosterilir`, Apple 3.1.1).
- Hesap silme uygulama içinde var (`DeleteAccountModal`, Apple 5.1.1(v)).
- **Apple ile giriş** (yalnızca iPhone):
  - Yerel pencere: `apps/mobile/ios/App/App/YerelEklentiler.swift`
    (`AppleGirisPlugin`, `ProjelioBridgeViewController` ile kaydediliyor).
  - Web: `SocialSignInButtons.tsx` `AppleButonu`, köprü `mobilKabuk.ts`
    `kabukAppleIleGiris`.
  - Sunucu: `backend/src/modules/apple/` — `POST /auth/apple`. Jetonun imzası
    Apple'ın anahtarlarıyla, nonce özeti ve `aud` (varsayılan
    `app.projelio.mobile`, `APPLE_ALICILAR` ile değişir) doğrulanır
    (`apple-kimlik.ts`, testli). Kimlikler `apple_hesaplari` tablosunda.
  - **Migration 195 canlıya elle uygulanmalı** (`./deploy/migrate.sh uygula`).
  - "E-postamı gizle" seçen kişi `…@privaterelay.appleid.com` adresiyle YENİ
    hesap açar; bu adrese e-posta gidebilmesi için Apple Developer >
    Services > Sign in with Apple for Email Communication'a gönderen alan adı
    (projelio.app) eklenmeli.

## Senin yapman gerekenler (sırayla)

1. **Apple Developer Program** üyeliği (yıllık 99 $). Şirket adına
   açılacaksa D-U-N-S numarası gerekir; birkaç gün sürebilir. App ID'de
   (`app.projelio.mobile`) **Push Notifications**, **Sign in with Apple** ve
   **Associated Domains** yetenekleri açılmalı (Xcode imzalarken kendisi de
   açabilir).
2. **Team ID**'yi bana ver (developer.apple.com > Membership). Şunlar için:
   - Xcode'da imzalama (Signing & Capabilities > Team).
   - `apple-app-site-association` dosyası (adım 6).
3. **App Store Connect'te uygulama kaydı**: Uygulamalar > + > Yeni uygulama,
   paket kimliği `app.projelio.mobile`. Verilen sayısal kimliği
   `APP_STORE_KIMLIGI`'ye yazacağız.
4. **Firebase**: aynı Firebase projesinde iOS uygulaması ekle (paket kimliği
   `app.projelio.mobile`), `GoogleService-Info.plist`'i indir →
   `apps/mobile/ios/App/App/` altına koyup Xcode'da App hedefine ekle.
   Apple Developer > Keys'ten **APNs anahtarı (.p8)** oluştur, Firebase >
   Proje ayarları > Cloud Messaging > Apple uygulaması yapılandırmasına yükle.
5. **CORS**: canlıda `CORS_ORIGINS`'e `capacitor://app.projelio.app` ekle.
   iOS'ta WebView'in kaynağı bu (WKWebView `https` şemasını devretmiyor);
   eklenmezse iPhone'da hiçbir API isteği geçmez. Oturum `Authorization`
   başlığıyla taşındığı için çerez/SameSite sorunu yok.
6. **Universal Link** (Google/Microsoft girişinin dönüşü):
   `apps/web/public/.well-known/apple-app-site-association` (uzantısız,
   `application/json` olarak sunulmalı):

   ```json
   {
     "applinks": {
       "details": [
         {
           "appIDs": ["<TEAM_ID>.app.projelio.mobile"],
           "components": [{ "/": "/google/return" }, { "/": "/microsoft/return" }]
         }
       ]
     }
   }
   ```

## Açık kararlar / riskler

- **Sign in with Apple (kural 4.8) — KARAR (2026-11-12):** iPhone'da
  Google/Microsoft düğmeleri GİZLİ (`SocialSignInButtons.tsx`, `kabukPlatformu`).
  iPhone'da yalnızca e-posta/şifre ile giriş var. Apple ile giriş eklenince
  düğmeler geri açılabilir.
- **Bilinen kısıt (kullanıcı kararıyla şimdilik böyle):** yalnızca Google ya da
  Microsoft ile açılmış, şifresi olmayan hesaplar iPhone'a GİREMEZ. "Şifremi
  unuttum" şifresiz hesaba bağlantı göndermiyor
  (`password-reset.service.ts` `requestReset`). Çözüm seçeneği: o hesaplara da
  sıfırlama bağlantısı göndermek (kişi bağlantıyla şifre koyar).
- **Universal Link dönüşü** (giriş düğmeleri yeniden açılırsa) SFSafariViewController'dan
  yönlendirmeyle her zaman tetiklenmeyebilir; cihazda denenmeli. Tutmazsa
  ASWebAuthenticationSession + özel şemaya geçilir.
- **Kural 4.2 (yalnızca web sarmalayıcı).** Push bildirimleri, uygulama içi
  değerlendirme, sesli not gibi yerel özellikler incelemede vurgulanmalı.
- İnceleme için **demo hesap** (e-posta + şifre) App Store Connect'e yazılmalı.
- Gizlilik etiketleri (App Privacy) ve gizlilik politikası adresi gerekli.
- Ekran görüntüleri: 6,9" iPhone (1320×2868) zorunlu; iPad desteği açık
  olduğu için 13" iPad görüntüsü de istenir (iPad'i kapatmak bir seçenek).
- Kullanıcının seçtiği bildirim sesi iPhone'da uygulanmıyor (sistem sesi).
- **Apple ile girişte hesap silinince Apple jetonu iptal edilmiyor.** Apple,
  hesap silmede "Sign in with Apple" yetkisinin REST API ile iptalini istiyor
  (5.1.1(v)); bunun için .p8 anahtarıyla istemci sırrı + yetkilendirme kodu
  gerekiyor. Şimdilik satır cascade ile siliniyor; inceleme bunu sorarsa
  eklenecek.
- Simülatörde Apple ile giriş penceresi imzasız derlemede çalışmaz; ilk
  gerçek deneme Team ID ile imzalanmış derlemede yapılır.
