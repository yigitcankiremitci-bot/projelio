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

/** Capacitor'ın çalışma anında sağladığı köprü — yalnızca kullandığımız kadarı. */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  Plugins?: {
    SafeArea?: {
      // Dönüş tipi bilerek `unknown`: köprü üzerinden çağrıldığında bu metot
      // Promise DÖNDÜRMÜYOR (undefined dönüyor). Tipini Promise yazıp
      // `.catch()` çağırmak uygulamayı komple hata sınırına düşürmüştü.
      setSystemBarsStyle?: (options: { style: "DARK" | "LIGHT" | "DEFAULT" }) => unknown;
    };
  };
}

function kopru(): CapacitorBridge | null {
  const cap = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return cap?.isNativePlatform?.() ? cap : null;
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
  try {
    const setStyle = kopru()?.Plugins?.SafeArea?.setSystemBarsStyle;
    if (!setStyle) return;
    // Promise.resolve: metot ister Promise dönsün ister undefined, ikisinde de
    // çalışır ve reddi yakalanmamış bırakmaz.
    void Promise.resolve(setStyle({ style: mode === "dark" ? "DARK" : "LIGHT" })).catch(() => {});
  } catch {
    // Köprü beklenmedik bir biçimdeyse sessizce vazgeç.
  }
}
