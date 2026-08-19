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
 * Tüm tut-taşı listelerinin paylaştığı ayarlar. Tek kaynak olmalı: sürüklemenin
 * hissi (basılı tutma, hayalet sınıfları) ve kenarda sayfayı kaydırma davranışı
 * listeden listeye değişmemeli. Bu hook'u kullanmayan yerler de (bkz.
 * TaskColumn'daki alt görev listeleri) buradan almalı.
 */
export const SORTABLE_BASE_OPTIONS: SortableOptions = {
  animation: 180,
  delay: LONG_PRESS_DELAY,
  delayOnTouchOnly: false,
  touchStartThreshold: 5,
  forceFallback: true,
  fallbackTolerance: 3,
  ghostClass: "sortable-ghost",
  chosenClass: "sortable-chosen",
  dragClass: "sortable-drag",
  // Sürüklenen kart ekranın üstüne/altına yaklaşınca sayfa kendiliğinden kayar.
  // Yoksa hedef görünür alanın dışındaysa kullanıcı kartı bir yere bırakıp
  // sayfayı kaydırıp yeniden almak zorunda kalıyordu — uzun listelerde bunu
  // defalarca tekrarlamak gerekiyordu.
  scroll: true,
  // Varsayılan 30px: kenarda o kadar ince bir şeride isabet ettirmek pratikte
  // "kaydırma hiç çalışmıyor" hissi veriyor.
  scrollSensitivity: 70,
  scrollSpeed: 16,
  // Kaydırılabilir bir kutunun içindeysek önce onu, sonra sayfayı kaydır.
  bubbleScroll: true,
  // forceFallback ile birlikte kaydırma, tarayıcının yerleşik sürükleme
  // olaylarına güvenemez; bu seçenek zamanlayıcıya dayalı güvenilir yolu zorlar.
  forceAutoScrollFallback: true,
};

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
      ...SORTABLE_BASE_OPTIONS,
      ...options,
    });

    return () => instance.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
