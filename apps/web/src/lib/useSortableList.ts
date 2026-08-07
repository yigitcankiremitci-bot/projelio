import { useEffect } from "react";
import type { RefObject } from "react";
import Sortable, { SortableOptions } from "sortablejs";

// Kısa süre basılı tutunca aktifleşen "tut-taşı" sıralaması için ortak ayarlar.
// Sürüklemeyi başlatan basılı tutma süresi (ms). Tek kaynak: bu hook'u kullanmayan
// yerler de (bkz. TaskColumn'daki alt görev listesi) buradan almalı ki tüm
// uygulamada aynı his olsun. Çok kısaltılırsa normal tıklama/kaydırma hareketleri
// yanlışlıkla sürükleme olarak algılanmaya başlar.
export const LONG_PRESS_DELAY = 180;

/**
 * Verilen container ref'inin doğrudan çocuklarını, basılı tutup sürükleyerek
 * sıralanabilir yapar (hem mouse hem dokunmatik). `deps` değiştiğinde (örn.
 * liste boştan doluya geçtiğinde) yeniden bağlanır.
 */
export function useSortableList(containerRef: RefObject<HTMLElement>, options: SortableOptions, deps: unknown[] = []) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const instance = Sortable.create(el, {
      animation: 180,
      delay: LONG_PRESS_DELAY,
      delayOnTouchOnly: false,
      touchStartThreshold: 5,
      forceFallback: true,
      fallbackTolerance: 3,
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass: "sortable-drag",
      ...options,
    });

    return () => instance.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
