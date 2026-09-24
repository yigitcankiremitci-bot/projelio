import type { ThemeMode } from "@projelio/shared";

/**
 * MOBİL KABUĞA (Capacitor) AÇILAN TEK KAPI.
 *
 * Bu dosya, web uygulamasının kabuk hakkında bir şey bildiği TEK yer olmalı.
 * Sebebi ilkesel: telefondaki uygulama apps/web'in ta kendisi, ayrı bir
 * uygulama değil (bkz. apps/mobile). Kabuğa özel dallanmalar bileşenlere
 * yayılmaya başladığı anda iki ayrı uygulamaya doğru kaymış oluruz — mobil
 * işin başındaki şart tam olarak bunun olmamasıydı. Yeni bir kabuk ihtiyacı
 * çıkarsa buraya bir fonksiyon eklenir, bileşenin içine `if (mobil)` değil.
 *
 * DERLEME BAĞIMLILIĞI YOK: eklenti paketi import EDİLMİYOR, Capacitor'ın
 * çalışma anında `window`a koyduğu köprü çağrılıyor. Böylece apps/web'in
 * package.json'ı mobile özgü hiçbir şey taşımıyor ve web paketine tek bayt
 * eklenmiyor. Tarayıcıda `window.Capacitor` yok, fonksiyonlar sessizce
 * hiçbir şey yapmıyor.
 */

/**
 * Capacitor'ın çalışma anında sağladığı köprü — yalnızca kullandığımız kadarı.
 *
 * Dönüş tipleri bilerek `unknown`: köprü üzerinden çağrıldığında bu metotların
 * hepsi Promise DÖNDÜRMEYEBİLİR (setSystemBarsStyle döndürmüyor). Tipini
 * Promise yazıp `.catch()` çağırmak uygulamayı komple hata sınırına düşürmüştü.
 */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: {
    SafeArea?: {
      setSystemBarsStyle?: (options: { style: "DARK" | "LIGHT" | "DEFAULT" }) => unknown;
    };
    Browser?: {
      open?: (options: { url: string }) => unknown;
      close?: () => unknown;
    };
    App?: {
      addListener?: (event: "appUrlOpen", handler: (data: { url?: string }) => void) => unknown;
    };
    PushNotifications?: {
      checkPermissions?: () => unknown;
      requestPermissions?: () => unknown;
      register?: () => unknown;
      addListener?: (event: string, handler: (data: any) => void) => unknown;
    };
  };
}

function kopru(): CapacitorBridge | null {
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
}

/** Köprü çağrısı: dönüşü Promise olsun olmasın, hata dışarı sızmaz. */
function guvenliCagir(fn: (() => unknown) | undefined): boolean {
  if (!fn) return false;
  try {
    void Promise.resolve(fn()).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Uygulama mobil kabuğun içinde mi çalışıyor? Tarayıcıda her zaman false. */
export function kabuktaMi(): boolean {
  return kopru() !== null;
}

/**
 * Ödeme akışı (paket, Lio Bakiyesi) gösterilebilir mi?
 *
 * MAĞAZA KURALI: Lio Bakiyesi ve paketler uygulama içinde tüketilen dijital
 * içerik. App Store (3.1.1) ve Google Play bunların uygulama içinde yalnızca
 * mağazanın kendi ödeme sistemiyle satılmasına izin veriyor; kartla ödeme
 * formu açmak da, "web'den satın al" diye yönlendirmek de ret sebebi. Bu
 * yüzden kabukta satın alma HİÇ görünmez — fiyat, paket listesi, "bakiye yükle"
 * çağrısı dahil. Bakiyeyi ve hareketleri GÖRMEK serbest; web'de alınan bakiye
 * telefonda da kullanılır (hesap aynı).
 */
export function satinAlmaGosterilir(): boolean {
  return !kabuktaMi();
}

/**
 * Sistem çubuklarının (durum çubuğu, gezinme çubuğu) İÇERİK rengini
 * uygulamanın temasına uydurur.
 *
 * NEDEN GEREKLİ. Android'de bu renk varsayılan olarak CİHAZIN karanlık/aydınlık
 * moduna göre belirleniyor, uygulamanınkine göre değil. Telefonu aydınlık
 * modda olup uygulamayı koyu temada kullanan biri, koyu zeminin üstünde siyah
 * bir saat ve pil simgesi görüyor — okunmuyor. Bu, kabuk tarafından
 * ayarlanamıyor: EdgeToEdge.enable'a SystemBarStyle.dark vermek, eklentinin
 * statusBarStyle yapılandırması ve temadaki windowLightStatusBar denendi,
 * üçü de etkisiz kaldı (emülatörde ölçüldü, bkz. MainActivity.java yorumu).
 * Geriye çalışma anı API'si kalıyor ve o da ancak buradan çağrılabiliyor.
 *
 * "DARK" eklentinin dilinde "koyu ZEMİN, yani AÇIK içerik" demek; bu yüzden
 * koyu temada DARK, aydınlık temada LIGHT gönderiliyor.
 *
 * HER ŞEY YUTULUYOR ve bu bilinçli: sistem çubuğunun rengi hiçbir işlevi
 * engellemez, ama buradan sızan bir istisna React ağacının kökünde patlıyor.
 * Nitekim patladı: metot Promise döndürüyor sanıp `.catch()` çağırdım,
 * "TypeError: t(...).catch is not a function" ile uygulamanın TAMAMI hata
 * sınırına düştü. Kabuk köprüsü sürüm sürüm değişen, bizim denetlemediğimiz
 * bir yüzey — buradan asla dışarı hata çıkmamalı.
 */
export function sistemCubuklariniTemayaUydur(mode: ThemeMode): void {
  const setStyle = kopru()?.Plugins?.SafeArea?.setSystemBarsStyle;
  guvenliCagir(setStyle && (() => setStyle({ style: mode === "dark" ? "DARK" : "LIGHT" })));
}

/**
 * SAĞLAYICIYLA GİRİŞ ADRESİNİ SİSTEM TARAYICISINDA AÇAR.
 *
 * Google gömülü WebView'da giriş sayfasını açmayı REDDEDİYOR
 * ("disallowed_useragent"); kullanıcı kabukta düğmeye bastığında karşısına
 * giriş ekranı değil bir hata sayfası çıkıyor. Microsoft da bazı hesap
 * türlerinde aynısını yapıyor. Adres bu yüzden sistem tarayıcısında (Android'de
 * Chrome Custom Tab) açılmalı.
 *
 * Dönüş yolu: zincirin sonunda backend https://app.projelio.app/google/return
 * adresine yönlendiriyor ve o adres uygulamaya doğrulanmış bir App Link olarak
 * kayıtlı (bkz. AndroidManifest.xml + apps/web/public/.well-known/assetlinks.json),
 * yani tarayıcı sayfayı açmak yerine uygulamaya teslim ediyor — dinleyicisi
 * aşağıda.
 *
 * Tarayıcıda (kabuk yoksa) false döner; çağıran o zaman her zamanki gibi
 * aynı sekmede yönlendirir.
 */
export function girisAdresiniSistemTarayicisindaAc(url: string): boolean {
  const open = kopru()?.Plugins?.Browser?.open;
  return guvenliCagir(open && (() => open({ url })));
}

/**
 * Sağlayıcı dönüşünü dinler: App Link uygulamaya teslim edildiğinde çağrılır.
 *
 * Handler'a TAM ADRES değil, uygulamanın kendi içindeki yol veriliyor
 * (`/google/return?code=...`): kabuğun WebView'i zaten app.projelio.app
 * kaynağında çalışıyor, yani router'a doğrudan verilebilir. Tam adresle
 * yönlendirmek sayfayı baştan yükletir ve açık olan oturumu gereksiz yere
 * sıfırlardı.
 *
 * Dönüş değeri temizleyici; kabuk yoksa hiçbir şey yapmayan bir fonksiyon.
 */
export function kabukDonusunuDinle(handler: (yol: string) => void): () => void {
  const addListener = kopru()?.Plugins?.App?.addListener;
  if (!addListener) return () => {};

  let handle: { remove?: () => unknown } | undefined;
  try {
    const sonuc = addListener("appUrlOpen", (data) => {
      const ham = data?.url;
      if (!ham) return;
      try {
        const adres = new URL(ham);
        // Tarayıcı sekmesi açık kalırsa kullanıcı uygulamaya döndüğünde
        // arkada duruyor; geri tuşuna basınca yeniden o sayfaya düşüyor.
        guvenliCagir(kopru()?.Plugins?.Browser?.close);
        handler(`${adres.pathname}${adres.search}`);
      } catch {
        // Adres ayrıştırılamadıysa yapacak bir şey yok.
      }
    });
    void Promise.resolve(sonuc)
      .then((h) => {
        handle = h as { remove?: () => unknown };
      })
      .catch(() => {});
  } catch {
    return () => {};
  }

  return () => guvenliCagir(handle?.remove && (() => handle!.remove!()));
}

/* ------------------------------------------------------------------ *
 * BİLDİRİMLER (FCM)                                                  *
 * ------------------------------------------------------------------ */

/**
 * NEDEN AYRI BİR YOL. Web'in push'u (service worker + VAPID, bkz. push.ts)
 * Android WebView'de ÇALIŞMAZ: WebView'de PushManager yok. 1.1.0'da kabuk bu
 * yüzden hiç sistem bildirimi alamıyordu; bildirimler yalnızca uygulama
 * açıkken çanın sayacına düşüyordu. Kabukta bildirim Firebase Cloud
 * Messaging'den gelir; cihazın FCM anahtarı sunucuya kaydedilir
 * (POST /notifications/devices) ve backend oraya gönderir (fcm.ts).
 */
const FCM_ANAHTARI = "projelio_fcm_token";

/** Sonucu Promise olsun olmasın bekler; köprü hatasında null döner. */
async function bekle<T>(fn: (() => unknown) | undefined): Promise<T | null> {
  if (!fn) return null;
  try {
    return (await Promise.resolve(fn())) as T;
  } catch {
    return null;
  }
}

let bildirimDinleyicileriKuruldu = false;

/**
 * Bildirim iznini ister ve cihazı FCM'ye kaydeder. Anahtar geldiğinde
 * `kaydet` çağrılır — anahtar Firebase tarafından ara ara yenilenir, o
 * zaman da yeniden çağrılır.
 *
 * Kabuk yoksa false döner; çağıran o zaman web push'u dener.
 *
 * İzin reddedilmişse bir daha SORULMAZ (Android zaten ikinci retten sonra
 * pencereyi göstermiyor); kullanıcı telefonun ayarlarından açabilir.
 */
export function kabukBildirimleriniBaslat(kaydet: (token: string) => Promise<void>): boolean {
  const push = kopru()?.Plugins?.PushNotifications;
  if (!push) return false;

  void (async () => {
    if (!bildirimDinleyicileriKuruldu && push.addListener) {
      bildirimDinleyicileriKuruldu = true;
      try {
        push.addListener("registration", (data: { value?: string }) => {
          const token = data?.value;
          if (!token) return;
          try {
            localStorage.setItem(FCM_ANAHTARI, token);
          } catch {
            // Depo kapalıysa çıkışta anahtar silinemez; kayıt yine yapılır.
          }
          void kaydet(token).catch(() => {});
        });
      } catch {
        bildirimDinleyicileriKuruldu = false;
        return;
      }
    }

    const durum = await bekle<{ receive?: string }>(push.checkPermissions);
    let izin = durum?.receive;
    if (izin === "prompt" || izin === "prompt-with-rationale") {
      izin = (await bekle<{ receive?: string }>(push.requestPermissions))?.receive;
    }
    if (izin !== "granted") return;
    await bekle(push.register);
  })();

  return true;
}

/** Bu cihazın en son kaydedilen FCM anahtarı (çıkışta sunucudan silmek için). */
export function kabukBildirimAnahtari(): string | null {
  if (!kabuktaMi()) return null;
  try {
    return localStorage.getItem(FCM_ANAHTARI);
  } catch {
    return null;
  }
}

/**
 * Bildirime dokunulduğunda ilgili sayfayı açar.
 *
 * Uygulama kapalıyken dokunulursa da çalışır: eklenti olayı dinleyici
 * bağlanana kadar saklıyor, dinleyici bağlanınca teslim ediyor.
 *
 * YALNIZCA uygulama içi yol kabul edilir: bağlantı sunucudan geliyor ama
 * "//baska-site" gibi bir değer router'a verilirse WebView dışarı gider.
 */
export function kabukBildirimDokunusunuDinle(handler: (yol: string) => void): () => void {
  const addListener = kopru()?.Plugins?.PushNotifications?.addListener;
  if (!addListener) return () => {};

  let handle: { remove?: () => unknown } | undefined;
  try {
    const sonuc = addListener("pushNotificationActionPerformed", (olay: any) => {
      const yol = uygulamaIciYol(olay?.notification?.data?.link);
      if (yol) handler(yol);
    });
    void Promise.resolve(sonuc)
      .then((h) => {
        handle = h as { remove?: () => unknown };
      })
      .catch(() => {});
  } catch {
    return () => {};
  }
  return () => guvenliCagir(handle?.remove && (() => handle!.remove!()));
}

/** Sunucunun verdiği bağlantıyı güvenli bir uygulama içi yola çevirir. */
export function uygulamaIciYol(link: unknown): string | null {
  if (typeof link !== "string" || !link) return null;
  try {
    const u = new URL(link, window.location.origin);
    if (u.origin !== window.location.origin) return null;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * SAĞLAYICI DÖNÜŞÜNÜN TARAYICIDA KALMASI                             *
 * ------------------------------------------------------------------ */

/**
 * Kabuktan başlatılan giriş akışlarına konan işaret.
 *
 * NEDEN GEREKLİ. Dönüş adresi (app.projelio.app/google/return) uygulamaya
 * doğrulanmış bir App Link olarak bağlı; normalde Android onu uygulamaya
 * teslim eder. Ama doğrulama CİHAZ TARAFINDA başarısız olabiliyor (kurulum
 * anında ağ, üretici ROM'u, ya da aynı paket adına daha önce farklı imzayla
 * kurulum yapılmış olması). O zaman dönüş tarayıcıda kalıyor ve kullanıcı
 * çıkmaza giriyor.
 *
 * İşaret ŞART, çünkü tarayıcıda açılan bir dönüş sayfası tek başına
 * "bu akış uygulamadan mı başladı" sorusunu yanıtlayamaz: Android'de
 * tarayıcıdan normal web girişi yapan kullanıcının dönüşü de birebir aynı
 * görünür. İşaret olmasaydı onları da uygulamaya yönlendirmeye çalışırdık.
 *
 * `next` üzerinden taşınıyor çünkü backend'in imzalı state'inde geri
 * yansıtılan tek alan o — sunucuda değişiklik gerektirmiyor.
 */
const KABUK_ISARETI = "kabuk";

/** Kabuktan giriş başlatırken `next`e işaretimizi ekler. */
export function kabukDonusHedefi(next = "/"): string {
  const ayirac = next.includes("?") ? "&" : "?";
  return `${next}${ayirac}${KABUK_ISARETI}=1`;
}

/** Dönüş sonrası gidilecek adresten işareti temizler — kullanıcı görmesin. */
export function kabukIsaretiniTemizle(next: string | null): string | null {
  if (!next) return next;
  try {
    const u = new URL(next, window.location.origin);
    u.searchParams.delete(KABUK_ISARETI);
    const q = u.searchParams.toString();
    return `${u.pathname}${q ? `?${q}` : ""}${u.hash}`;
  } catch {
    return next;
  }
}

/**
 * Bu dönüş uygulamada olmalıydı ama tarayıcıda mı açıldı?
 *
 * Üç koşul birden: akış kabuktan başlamış (işaret var), şu an kabukta
 * DEĞİLİZ, ve cihaz Android (kurtarma yolu olan `intent://` yalnızca orada
 * çalışıyor).
 */
export function kabukDonusuTarayicidaMi(next: string | null): boolean {
  if (!next || !next.includes(`${KABUK_ISARETI}=1`)) return false;
  if (kabuktaMi()) return false;
  return /android/i.test(navigator.userAgent);
}

/**
 * Bulunulan adresi UYGULAMADA açan Android intent adresi.
 *
 * `package=` ile açık hedef veriliyor: App Link doğrulaması tutmamış olsa bile
 * bu adres uygulamayı açar — kurtarmanın çalışma sebebi tam olarak bu.
 * Geri dönüş adresi (browser_fallback_url) BİLEREK yok: aynı sayfaya düşerdi
 * ve kullanıcı döngüye girerdi.
 */
export function uygulamadaAcAdresi(): string {
  const { host, pathname, search } = window.location;
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=app.projelio.mobile;end`;
}
