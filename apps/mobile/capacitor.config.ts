import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Mobil kabuk yapılandırması.
 *
 * Buradaki uygulama apps/web'in TA KENDİSİ: Vite çıktısı (apps/web/dist)
 * doğrudan uygulamanın içine kopyalanıp yerel bir WebView'de açılıyor. Ayrı bir
 * mobil istemci yok, olmayacak da — daha önce React Native ile yazılan ayrı
 * uygulama tam olarak bu yüzden terk edildi (bkz. docs/mobil-masaustu-devir.md).
 *
 * NEDEN hostname "app.projelio.app":
 * Capacitor'ın Android'deki varsayılan kaynağı "https://localhost". Backend'in
 * CORS listesi (CORS_ORIGINS) canlıda yalnızca gerçek alan adlarını içeriyor,
 * yani varsayılanla çıkılan her APK sunucudan CORS hatası alır ve uygulama
 * bomboş açılır — hem de sebebi telefonda görünmez. Kaynağı web sitesinin
 * adıyla aynı yapınca sunucuda hiçbir şey değiştirmeye gerek kalmıyor.
 * İkinci faydası: Android App Links (OAuth dönüşü) aynı alan adı üzerinden
 * kurulacak, yani bu seçim ileride de doğru olanı.
 *
 * DİKKAT: bu ad yalnızca WebView'in kendi kaynağıdır; ağa çıkan hiçbir istek
 * buraya gitmez. API adresi derleme anında VITE_API_URL'den gömülür.
 */
const config: CapacitorConfig = {
  appId: "app.projelio.mobile",
  appName: "Projelio",
  // apps/web'in derleme çıktısı. Kopyalanmaz, `cap sync` her seferinde tazeler.
  webDir: "../web/dist",
  server: {
    androidScheme: "https",
    hostname: "app.projelio.app",
  },
  android: {
    // Web uygulaması kendi karanlık/aydınlık temasını yönetiyor; WebView'in
    // kendi arka planını koyu bırakıyoruz ki açılışta beyaz bir çakma olmasın
    // (varsayılan tema karanlık, bkz. 369ddf5).
    backgroundColor: "#1C222C",
  },
  plugins: {
    SplashScreen: {
      backgroundColor: "#1C222C",
      // AutoHide KAPATILAMAZ: kapatıldığında açılış ekranını yalnızca
      // SplashScreen.hide() kaldırır, o çağrı da web uygulamasında yok ve
      // OLMAYACAK — apps/web Capacitor'ı tanımıyor, tanımamalı da (mobil
      // kabuk yüzünden web koduna dallanma girmesi tam olarak kaçındığımız
      // şey). Kapalı bırakılınca uygulama logoda sonsuza kadar asılı kalıyor.
      launchAutoHide: true,
      // Web zaten kendi yükleniyor ekranını gösteriyor; burada uzun beklemek
      // açılışı yavaş göstermekten başka işe yaramaz.
      launchShowDuration: 500,
      launchFadeOutDuration: 250,
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      // Uygulama AÇIKKEN gelen bildirim de sistem bildirimi olarak görünsün.
      // Eklentinin varsayılanı göstermemek; o zaman bildirim yalnızca çanın
      // sayacına düşüyor ve telefonda kimse fark etmiyor. Kapalıyken zaten
      // Android gösteriyor (bkz. backend notifications/fcm.ts).
      presentationOptions: ["alert", "sound", "badge"],
    },
  },
};

export default config;
