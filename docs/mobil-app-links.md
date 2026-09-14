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

Listedeki her parmak izi, uygulamayı imzalayan bir anahtara ait. Üçü de
gerekli ve hiçbiri silinmemeli:

| Sıra | Anahtar | Ne zaman kullanılır |
|---|---|---|
| 1 | Play App Signing — klasik | Mağazadan inen sürüm |
| 2 | Play App Signing — kuantum sonrası (Beta) | Google bu anahtara geçerse mağaza sürümü |
| 3 | Geliştirme (debug) | Elden kurulan APK'lar, emülatör |

Play'in iki anahtarı Play Console > Google Play ile korunanlar > Uygulama
imzalama sayfasından alındı (`.../app/<id>/keymanagement`). Değerler sayfada
metin olarak GÖRÜNMÜYOR, yalnızca "kopyala" düğmesi var.

Kuantum sonrası anahtar bilerek listede: Google o anahtara geçtiği gün eksik
olsaydı giriş sessizce bozulurdu ve sebebi hiçbir yerde yazmazdı. Fazladan bir
parmak izi ise hiçbir şeye mal olmuyor — eşleşmeyen satır yok sayılıyor.

Yeni bir imza anahtarı devreye girerse (ör. anahtar değiştirme) buraya
EKLENMELİ. Eksik kalırsa mağazadan inen sürümde Google/Microsoft ile giriş
sessizce tarayıcıda açılıp uygulamaya dönmez, hata da vermez.

## Doğrulama

Dosya yayına çıktıktan sonra:

    curl https://app.projelio.app/.well-known/assetlinks.json

Cihazda doğrulamanın tutup tutmadığı:

    adb shell pm get-app-links app.projelio.mobile
