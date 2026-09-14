# Mobil: Android App Links (Google/Microsoft ile giriş)

Dosya: `apps/web/public/.well-known/assetlinks.json` — yayında
`https://app.projelio.app/.well-known/assetlinks.json` adresinden servis edilir.

`assetlinks.json`, Android'e "app.projelio.app adresindeki şu yolları şu
uygulama açabilir" demenin resmi yolu (Android App Links). Mobil kabukta
Google/Microsoft ile giriş buna dayanıyor:

Google gömülü WebView'da giriş sayfasını açmayı reddediyor, bu yüzden adres
SİSTEM TARAYICISINDA açılıyor. Zincirin sonunda backend
`https://app.projelio.app/google/return?code=...` adresine yönlendiriyor; o
adres doğrulanmış olduğu için Android sayfayı tarayıcıda açmak yerine
uygulamaya teslim ediyor ve devir kodu uygulamanın içinde token'a çevriliyor.

**Özel şema (`projelio://`) bilerek KULLANILMADI:** onu başka bir uygulama da
kaydedebilir, yani tek kullanımlık devir kodu yanlış uygulamaya düşebilir ve o
kod doğrudan oturum token'ına çevrilebilir — hesap ele geçirme demek. App
Links'te alan adı doğrulaması var, o risk yok.

## Parmak izleri

Listedeki her parmak izi, uygulamayı imzalayan bir anahtara ait. Şu an yalnızca
GELİŞTİRME (debug) anahtarı var; onunla üretilen APK'lar telefonda ve
emülatörde doğrulanıyor.

**Play'e ilk yüklemeden sonra Play App Signing'in verdiği SHA-256 parmak izi
buraya EKLENMELİ** (Play Console > Yayın > Uygulama bütünlüğü). Eksik kalırsa
mağazadan inen sürümde Google/Microsoft ile giriş sessizce tarayıcıda açılıp
uygulamaya dönmez. Liste birden fazla parmak izi kabul eder; debug olanı
silmeye gerek yok.

## Doğrulama

Dosya yayına çıktıktan sonra:

    curl https://app.projelio.app/.well-known/assetlinks.json

Cihazda doğrulamanın tutup tutmadığı:

    adb shell pm get-app-links app.projelio.mobile
