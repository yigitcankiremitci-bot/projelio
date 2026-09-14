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
