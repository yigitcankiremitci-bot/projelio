// @types/sortablejs paketi bu sandbox'ta dosya sistemi çakışması nedeniyle
// kurulamadı; ihtiyacımız olan minimal API yüzeyi için elle tip tanımı.
declare module "sortablejs" {
  export interface SortableEvent {
    item: HTMLElement;
    from: HTMLElement;
    to: HTMLElement;
    oldIndex?: number;
    newIndex?: number;
  }

  export interface SortableOptions {
    group?: string | { name: string; pull?: boolean | "clone"; put?: boolean };
    sort?: boolean;
    // Sürükleme geçici olarak kapatılabilsin diye (bkz. TaskColumn'da seçim
    // modu): Sortable örneğini yok edip yeniden kurmak, sürüklemenin tam
    // ortasında olan bir render'da hareketi yarıda kesiyordu.
    disabled?: boolean;
    delay?: number;
    delayOnTouchOnly?: boolean;
    touchStartThreshold?: number;
    animation?: number;
    forceFallback?: boolean;
    fallbackTolerance?: number;
    ghostClass?: string;
    chosenClass?: string;
    dragClass?: string;
    filter?: string;
    preventOnFilter?: boolean;
    handle?: string;
    // Kenara yaklaşınca sayfayı/kutuyu kaydırma (AutoScroll eklentisi; paketin
    // varsayılan derlemesinde zaten bağlı). Bkz. lib/useSortableList.
    scroll?: boolean | HTMLElement;
    scrollSensitivity?: number;
    scrollSpeed?: number;
    bubbleScroll?: boolean;
    forceAutoScrollFallback?: boolean;
    onEnd?: (event: SortableEvent) => void;
    onStart?: (event: SortableEvent) => void;
  }

  export default class Sortable {
    static create(el: HTMLElement, options?: SortableOptions): Sortable;
    destroy(): void;
    option<K extends keyof SortableOptions>(name: K, value?: SortableOptions[K]): void;
  }
}
