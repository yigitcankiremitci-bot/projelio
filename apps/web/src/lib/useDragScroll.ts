import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import { LONG_PRESS_DELAY } from "./useSortableList";

/**
 * Yatay kaydırılan kutuları FAREYLE tutup sürüklenebilir yapar.
 *
 * SORUN. `overflowX: auto` bir şeritte dizüstü dokunmatik yüzeyi (iki parmak)
 * ve dokunmatik ekran çalışıyor, ama fare kullanan kullanıcının elinde tek bir
 * yol kalıyordu: incecik kaydırma çubuğunu yakalayıp sürüklemek. Şeritler
 * (departmanlar, ürünler, sekmeler, görev panoları) tam da fareyle gezilen
 * yerler olduğu için bu pratikte "kaydırılamıyor" demekti.
 *
 * SIRALAMAYLA ÇAKIŞMIYOR — ve bu kendiliğinden değil, ölçüyle böyle. Aynı
 * şeritlerin bir kısmında tut-taşı sıralama var (bkz. useSortableList) ve o da
 * fareyle basılı tutmayla başlıyor. İkisini ayıran şey Sortable'ın
 * `delay: LONG_PRESS_DELAY` (180 ms) ayarı:
 *
 *   - 180 ms DOLMADAN eşiği aşan bir hareket  -> KAYDIRMA (burası)
 *   - 180 ms basılı bekleyip sonra hareket    -> SIRALAMA (Sortable)
 *
 * Yani süre dolduğunda buradaki aday sürükleme sessizce iptal ediliyor. Aynı
 * sabitten okunuyor ki biri değişince ikisi ayrışmasın.
 *
 * Dokunmatik ve kalem HİÇ ele alınmıyor: onlarda tarayıcının kendi kaydırması
 * zaten var, araya girmek onu bozardı. Yalnızca `pointerType === "mouse"`.
 */

/** Kaydırmanın başladığı sayılan en küçük yatay hareket (px). */
const THRESHOLD = 6;

/**
 * Basılı tutulduğunda KENDİ işini yapması gereken öğeler; bunların üstünde
 * başlayan sürükleme kaydırma sayılmaz. Kaydırıcı (range) listede olmak zorunda:
 * yakınlaştırma çubuğunu sürüklemek yatay bir harekettir ve şeridi kaydırmaya
 * çevrilirse çubuk kullanılamaz hale gelir (bkz. ProductPhotoCropModal).
 */
const INTERACTIVE_SELECTOR = "input, textarea, select, [contenteditable='true']";

/**
 * REF DEĞİL, GERİ ÇAĞIRMA REF'İ döner — ve bu bilerek böyle.
 *
 * Önce sıradan bir `useRef` dönüyordu ve efekt yalnızca `enabled`'a bağlıydı.
 * Sonuç sessiz bir ölümdü: bu şeritlerin çoğu veriyi sunucudan çekiyor ve ilk
 * render'da "Yükleniyor…" basıyor, yani efekt çalıştığında kaydırılacak düğüm
 * HENÜZ YOK. `ref.current` null olduğu için kanca hiçbir şeye bağlanmıyor,
 * liste geldiğinde de efekt yeniden çalışmadığı için bir daha denemiyordu —
 * sürükleme, tam da en çok gerektiği yerlerde çalışmıyordu.
 *
 * Geri çağırma ref'inde bu mümkün değil: düğüm DOM'a girdiğinde React zaten
 * çağırıyor, çıktığında null ile tekrar çağırıyor. Çağrı yerinin bir bağımlılık
 * listesi vermesi (ve onu yanlış yazması) gerekmiyor.
 *
 * @param enabled Kutu o an gerçekten yatay kaydırılıyorsa true. Kanban panoları
 *                dar ekranda sütunları alt alta diziyor (`overflowX` yok) —
 *                orada sürüklemenin bağlanacak bir şeyi yok.
 * @param externalRef Kutunun düğümü başka bir işe de gerekiyorsa (ör. TabBar
 *                    kendi ok düğmeleri için kaydırma konumunu ölçüyor) o ref
 *                    verilir; kanca düğümü oraya da yazar.
 */
export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  enabled = true,
  externalRef?: MutableRefObject<T | null>
) {
  const [el, setEl] = useState<T | null>(null);

  const ref = useCallback(
    (node: T | null) => {
      if (externalRef) externalRef.current = node;
      setEl(node);
    },
    [externalRef]
  );

  useEffect(() => {
    if (!el || !enabled) return;

    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startTime = 0;
    let aday = false;
    let suruklerken = false;

    const kaydirilabilir = () => el.scrollWidth - el.clientWidth > 1;

    const bitir = () => {
      aday = false;
      if (!suruklerken) return;
      suruklerken = false;
      el.style.cursor = "grab";
      document.body.style.removeProperty("user-select");

      // Sürükleme bittiğinde tarayıcı, basılan öğe üzerinde bir "click" üretir:
      // önlem alınmazsa kaydırmayı bitirdiğin kartın sayfası açılır. Tek
      // seferlik ve YAKALAMA evresinde dinleyip yutuyoruz. setTimeout ile
      // temizlik şart: sürükleme kutunun dışında bittiyse click hiç gelmez ve
      // dinleyici kullanıcının bir SONRAKİ gerçek tıklamasını yerdi.
      const yut = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener("click", yut, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", yut, { capture: true }), 0);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      if (!kaydirilabilir()) return;
      const hedef = e.target as HTMLElement | null;
      if (hedef?.closest?.(INTERACTIVE_SELECTOR)) return;

      aday = true;
      suruklerken = false;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = el.scrollLeft;
      startTime = performance.now();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!aday) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!suruklerken) {
        // Basılı tutma süresi dolduysa hareket artık Sortable'ın: çekil.
        if (performance.now() - startTime >= LONG_PRESS_DELAY) {
          aday = false;
          return;
        }
        // Dikey ağırlıklı hareket bu şeridin işi değil (sayfa kaydırma,
        // pano içindeki dikey liste).
        if (Math.abs(dx) <= THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
        suruklerken = true;
        el.style.cursor = "grabbing";
        // Sürüklerken metin seçilmesin. preventDefault yerine bu: fare
        // hareketinde preventDefault seçimi güvenilir biçimde durdurmuyor.
        document.body.style.setProperty("user-select", "none");
      }

      el.scrollLeft = startScrollLeft - dx;
    };

    el.addEventListener("pointerdown", onPointerDown);
    // Hareket ve bırakma PENCEREDE dinleniyor: fare şeridin dışına çıktığında
    // sürükleme kopmasın, kullanıcı elini kaldırana kadar sürsün.
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", bitir);
    window.addEventListener("pointercancel", bitir);

    // "Buradan tutabilirsin" işareti. Taşma içerikle değiştiği için her
    // girişte yeniden bakılıyor; bir gözlemci kurmaya değmez.
    const onEnter = () => {
      el.style.cursor = kaydirilabilir() ? "grab" : "";
    };
    el.addEventListener("pointerenter", onEnter);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointerenter", onEnter);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", bitir);
      window.removeEventListener("pointercancel", bitir);
      document.body.style.removeProperty("user-select");
      el.style.cursor = "";
    };
  }, [el, enabled]);

  return ref;
}
