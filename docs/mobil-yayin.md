# Play'e yayın: imza anahtarı ve AAB

Bu belge, Projelio'yu Google Play'e yüklerken YALNIZCA BİR KEZ yapılacak
kurulumu anlatıyor. Sıra önemli — mağaza içi satın alma (abonelik) dahil
sonraki her şey buradan geçiyor.

## 1. Yükleme anahtarını üret (senin yapman gerekiyor)

Anahtarın parolası bir sır; onu ben üretip repoda ya da sohbette tutamam.
Terminalde şunu çalıştır ve parolaları **parola yöneticine** kaydet:

```bash
~/.projelio-toolchain/jdk-21*/Contents/Home/bin/keytool -genkeypair -v \
  -keystore ~/projelio-upload.jks -alias projelio-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Sonra `apps/mobile/android/keystore.properties` dosyasını oluştur (bu dosya
.gitignore'da, repoya girmez):

```properties
storeFile=/Users/<kullanıcı>/projelio-upload.jks
storePassword=<parola>
keyAlias=projelio-upload
keyPassword=<parola>
```

**Play App Signing kullan** (Play Console ilk yüklemede öneriyor): asıl imza
anahtarını Google saklar, sen yalnızca "yükleme anahtarı"nı kullanırsın.
Yükleme anahtarı kaybolursa Google sıfırlayabilir; App Signing'siz kaybolan
anahtar, uygulamaya bir daha GÜNCELLEME GÖNDERİLEMEMESİ demektir.

## 2. AAB üret

```bash
npm run android:aab --workspace @projelio/mobile
```

Çıktı `output/projelio-<tarih>.aab`. Play yeni uygulamalarda APK kabul
etmiyor; APK yalnızca elden deneme için.

`versionCode` her yüklemede ARTMALI
(`apps/mobile/android/app/build.gradle`); Play aynı numarayı ikinci kez kabul
etmez.

## 3. Play Console

1. Uygulama oluştur — paket adı `app.projelio.mobile`. **Bu ad sonradan
   değiştirilemez.**
2. AAB'yi **iç test** (internal testing) kanalına yükle.
3. **Uygulama bütünlüğü** ekranından Play App Signing'in SHA-256 parmak izini
   al ve `apps/web/public/.well-known/assetlinks.json` içine EKLE
   (bkz. docs/mobil-app-links.md). Eksik kalırsa mağazadan inen sürümde
   Google/Microsoft ile giriş sessizce tarayıcıda kalır.
4. Abonelik ürünlerini tanımla (Starter / Pro / Business × aylık / yıllık).
   Ürün kimliklerini not et.
5. Ürün kimliklerini Admin paneli > abonelik plan eşleştirmesine gir
   (`billing_plan_refs`); kod bu eşleşmeyi oradan okuyor, gömülü değil.
6. Play Developer API için bir Google Cloud servis hesabı aç, Play Console'da
   yetkilendir ve sunucuya `PLAY_*` ortam değişkenlerini tanımla
   (`PLAY_PACKAGE_NAME=app.projelio.mobile`).

## Neden bu sırada

Abonelik ürünleri, uygulama Play Console'da VAR OLMADAN tanımlanamıyor;
uygulama da imzalı bir AAB yüklenmeden oluşmuyor. Mağaza içi satın alma
akışı ayrıca emülatörde denenemiyor (Play Store yok) ve yalnızca iç test
kanalındaki lisanslı test hesaplarıyla çalışıyor. Yani 1-3 bitmeden satın
alma kodu yazılsa bile hiçbir yerde koşturulamaz.
