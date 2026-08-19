import { useEffect, useRef } from "react";

/**
 * Yazılan kutunun oturduğu hiza: görünür alanın üstünden ölçülen oran.
 * 0.75 = kutunun ALT kenarı, aşağıdan dörtte birlik yüksekliğe gelir. Daha
 * aşağısı mobildeki sabit alt menünün (BottomNav: 68px + güvenli alan) arkasına
 * düşme riski taşıyor; daha yukarısı listenin görünen kısmını gereksiz kısaltıyor.
 */
const ANCHOR_RATIO = 0.75;

/** Bu kadarlık sapma için kaydırmaya değmez — kutu her tuş vuruşunda titremesin. */
const ANCHOR_TOLERANCE = 8;

/**
 * Kutu hizaya çıkamıyorsa sayfanın altına açılan geçici yer. Kutu belgenin
 * sonundaysa (ör. son sütundaki "Görev ekle") kaydıracak mesafe kalmıyor,
 * kutu yerinden oynayamıyordu.
 */
const SCROLL_ROOM = "40vh";

/**
 * Kutunun alt kenarının hizadan ne kadar aşağıda olduğu. Negatif/sıfırsa kutu
 * hizanın üstünde demektir.
 *
 * Ölçü GÖRSEL görünür alana (visualViewport) göre: klavye açıkken ekranın
 * gerçekten görünen kısmı budur, `window.innerHeight` değil. `offsetTop` görsel
 * alanın yerleşim alanı içindeki kaymasıdır — `getBoundingClientRect` yerleşim
 * alanına göre ölçtüğü için ikisi aynı eksene getirilmeli.
 */
function distanceBelowAnchor(el: HTMLElement): number {
  const viewport = window.visualViewport;
  const anchor = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) * ANCHOR_RATIO;
  return el.getBoundingClientRect().bottom - anchor;
}

/**
 * Yazılan bir kutuyu (hızlı görev ekleme, yerinde ad değiştirme) görünür alanda
 * ve sabit bir hizada tutar. Kural mobil ve masaüstünde aynı.
 *
 * Neden gerekti: yeni görev listenin sonuna eklendiği için sütunun altındaki
 * hızlı ekleme kutusu her kayıtta bir kart boyu aşağı iniyor; birkaç görev sonra
 * ekranın altından çıkıyordu. Aynı şey uzun bir başlığı yerinde düzenlerken de
 * oluyor: kutu büyüdükçe alt kenarı ekranın dışına taşıyor.
 *
 * `scrollIntoView({ block: "nearest" })` yetmiyordu: kutuyu YERLEŞİM görünür
 * alanının en altına dayıyor, mobilde orası sabit alt menünün arkası oluyor ve
 * kutu yine gözden kayboluyordu. Bu yüzden hiza elle hesaplanıyor.
 *
 * Hizalama TEK YÖNLÜ: kutu hizanın üstündeyse zaten rahat görünüyordur, oraya
 * "hizalamak" için sayfayı aşağı itmek kullanıcının baktığı yeri sebepsiz
 * oynatırdı. Kutu yalnızca aşağı doğru kayıyor, o yüzden tek yön yetiyor.
 *
 * @param active Kutu şu an açık mı (kapalıyken hiçbir şey yapılmaz).
 * @param deps   Kutuyu yerinden oynatabilecek değerler (yazılan metin, kayıt sayısı).
 */
export function useKeepInView<T extends HTMLElement>(active: boolean, deps: unknown[]) {
  const ref = useRef<T>(null);
  const roomAdded = useRef(false);

  // Alt boşluk yalnızca GEREKİRSE açılıyor: her düzenlemede peşinen açmak,
  // masaüstünde sayfayı sebepsiz uzatıp kaydırma çubuğunu oynatıyordu.
  // Bir kez açıldıysa kutu kapanana kadar duruyor — hiza tutturulunca geri
  // alınsaydı sayfa kısalır, kutu yeniden aşağı düşer ve açılıp kapanma
  // döngüsüne girerdi.
  const openScrollRoom = () => {
    if (roomAdded.current) return;
    roomAdded.current = true;
    document.body.style.paddingBottom = SCROLL_ROOM;
  };

  useEffect(() => {
    if (!active) return;
    return () => {
      if (!roomAdded.current) return;
      roomAdded.current = false;
      document.body.style.paddingBottom = "";
    };
  }, [active]);

  // Klavye açılıp kapandığında görünür alan değişir; kutu hizasına geri oturur.
  // Klavye animasyonu sürerken yumuşak kaydırma titriyor, o yüzden anlık.
  useEffect(() => {
    if (!active) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const onResize = () => {
      const el = ref.current;
      if (!el) return;
      const delta = distanceBelowAnchor(el);
      if (delta <= ANCHOR_TOLERANCE) return;
      openScrollRoom();
      window.scrollBy({ top: delta, behavior: "auto" });
    };
    viewport.addEventListener("resize", onResize);
    return () => viewport.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    const el = ref.current;
    if (!active || !el) return;
    const delta = distanceBelowAnchor(el);
    if (delta <= ANCHOR_TOLERANCE) return;
    openScrollRoom();
    window.scrollBy({ top: delta, behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ...deps]);

  return ref;
}
