# Mobil + masaüstü mağaza yayını — durum notu

Projelio'yu **Google Play, App Store, Mac ve Windows**'ta yayımlama işi.
Değişmez şart: **mobil ve masaüstü uygulama, web'deki Projelio'nun (`apps/web`)
her anlamda aynısı olacak** — ayrı, eksik bir uygulama kabul edilmiyor.

## Karar: kabuk, ayrı uygulama değil

| Platform | Kabuk | Durum |
|---|---|---|
| Android | Capacitor (`apps/mobile`) | Çalışıyor, APK üretiliyor |
| iOS | Capacitor | Başlanmadı |
| Mac + Windows | Electron | Başlanmadı |

Daha önce `apps/mobile` altında Expo/React Native ile yazılmış ayrı bir 5 ekranlık
uygulama vardı; telefonda denendi ve REDDEDİLDİ ("web'deki özelliklerin hiçbiri
yok, yeni bir uygulama gibi"). O kod tamamen kaldırıldı. Bu yolu tekrar açmadan
önce sebebini hatırla: iki ayrı istemci = iki ayrı ürün.

Aynı sebeple **`apps/web` içinde kabuğa özel dallanma yasağı** var. Tek istisna
`apps/web/src/lib/mobilKabuk.ts`; kabuk hakkında bir şey bilmesi gereken her şey
oradan geçer. Bileşenlerin içine `if (mobil)` girdiği gün iki ürüne doğru
kaymaya başlarız.

## Derleme

```bash
npm run android:apk --workspace @projelio/mobile   # web derle + sync + APK -> output/
npm run ikon --workspace @projelio/mobile          # ikon/açılış görselleri
```

Araç zinciri **Homebrew ile değil**, doğrudan üreticiden ev dizinine kuruldu:
bu makine Intel Mac ve Homebrew orada artık hazır paket üretmiyor (kaynaktan
derlemek saatler sürüyor), üstelik `/usr/local/share/man/man8` izin hatası
veriyor.

| Ne | Nerede | Kaynak |
|---|---|---|
| JDK 21 | `~/.projelio-toolchain/jdk-21*` | Adoptium API |
| Android SDK (platform 36, build-tools 36) | `~/Library/Android/sdk` | dl.google.com cmdline-tools |
| Emülatör (Pixel 6, Android 35) | AVD adı `projelio` | sdkmanager |

Betik üçünü de kendi buluyor (`apps/mobile/scripts/apk-uret.mjs`); elle
`JAVA_HOME` / `ANDROID_HOME` vermek gerekmiyor.

`sdkmanager` indirmesi yarıda koparsa **çıkış kodu yine 0 oluyor** — bittiğini
dosyanın varlığına bakarak doğrula, çıkış koduna değil.

### Emülatörde deneme

```bash
ANDROID_HOME=$HOME/Library/Android/sdk
$ANDROID_HOME/emulator/emulator -avd projelio -no-snapshot -gpu swiftshader_indirect &
$ANDROID_HOME/platform-tools/adb install -r output/<apk>
$ANDROID_HOME/platform-tools/adb shell monkey -p app.projelio.mobile -c android.intent.category.LAUNCHER 1
```

Emülatördeki WebView 124 — yani **eski WebView yolunu** test ediyor (aşağıya bak).
Gerçek telefonlarda genelde yeni yol çalışır; ikisi de denenmiş olmalı.

## Kabuğun çözdüğü tuzaklar (hepsi yaşandı)

- **Kaynak adı `app.projelio.app`** (`capacitor.config.ts` `server.hostname`).
  Capacitor'ın Android varsayılanı `https://localhost` ve backend'in CORS listesi
  onu KABUL ETMİYOR (canlıya sorularak doğrulandı). Varsayılanla çıkan APK açılır
  ama hiçbir isteği başarılı olmaz, üstelik sebebi telefonda görünmez.
- **Açılış ekranı `launchAutoHide: false` bırakılamaz.** O ayarda ekranı yalnızca
  `SplashScreen.hide()` kaldırır, o çağrı da web'de yok ve olmayacak — uygulama
  logoda sonsuza kadar asılı kalır.
- **İkonlar `scripts/ikon-uret.py` ile üretilir.** Logoyu doğrudan vermek olmuyor
  (adaptive icon maskesi kenarları kesiyor) ve `@capacitor/assets` arka katmana da
  iç boşluk uygulayıp simgenin çevresinde siyah bir halka bırakıyor; betik o xml'i
  düzeltiyor. Zemin AÇIK olmak zorunda: logonun lacivert kısımları koyu zeminde
  kayboluyor ve logonun rengiyle oynanması reddedildi.
- **Güvenli alan (edge-to-edge).** Android 15'ten beri zorunlu, targetSdk 36'da
  kapatılamıyor. Web tarafı `env(safe-area-inset-*)` kullanıyor
  (`apps/web/src/lib/layout.ts` → `SAFE_TOP` / `SAFE_BOTTOM`); düzeltmenin webde
  olmasının sebebi üst şeritteki her şeyin `position: fixed` olması — kabuğun
  WebView'e dolgu vermesi onları kurtarmıyor. Eski WebView'lerde (Chromium < 140)
  `env()` yanlış geldiği için `@capacitor-community/safe-area` devrede.
- **Sistem çubuklarının rengi kabuktan ayarlanamıyor.** `EdgeToEdge.enable`'a
  `SystemBarStyle.dark`, eklentinin `statusBarStyle` ayarı ve temadaki
  `windowLightStatusBar` — üçü de denendi, üçü de etkisiz; renk CİHAZIN moduna
  göre belirleniyor. Tek yol çalışma anı API'si, o da `mobilKabuk.ts`'ten
  çağrılıyor (`ThemeProvider` tema değişince tetikliyor).
- **Köprü çağrıları `Promise` DÖNDÜRMEYEBİLİR.** `setSystemBarsStyle` döndürmüyor;
  `.catch()` çağırmak `TypeError` ile uygulamanın tamamını hata sınırına düşürdü.
  `mobilKabuk.ts` bu yüzden her şeyi yutuyor.

## Yapılacaklar

1. **Google/Microsoft ile giriş.** Gömülü WebView'da Google engelliyor; sistem
   tarayıcısı + App Links gerekiyor (`@capacitor/browser` kurulu, kullanılmıyor).
   Alan adı `app.projelio.app` seçildiği için assetlinks yolu açık.
2. **Uygulama içinde iyzico ödemesinin gizlenmesi.** Play ve App Store reddeder.
   Backend'de mağaza doğrulaması hazır (`billing/store-purchases.service.ts`).
3. Telefon ekranı düzeni: kullanıcı geri bildirimiyle ekran ekran sürüyor.
4. Push bildirimleri (`@capacitor/push-notifications`, FCM).
5. Play Console: AAB + imza, kapalı test, Data Safety, içerik derecelendirmesi.
   Yeni kişisel geliştirici hesaplarında 12 test kullanıcısıyla 14 günlük kapalı
   test istenebilir.
6. iOS (Capacitor), sonra Electron ile Mac + Windows.

`PLAY_PACKAGE_NAME` sunucuda henüz tanımlı değil; değeri `app.projelio.mobile`.
Paket kimliği Play'e ilk yüklemeden sonra DEĞİŞTİRİLEMEZ.
