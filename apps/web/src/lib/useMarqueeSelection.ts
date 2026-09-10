import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Kement (tarayarak) seçim: boşluğa basılı tutup sürükleyince çizilen
 * dikdörtgene değen her öğe seçilir.
 *
 * NEDEN VİEWPORT KOORDİNATLARI: hem kementin hem öğelerin ölçüsü
 * `getBoundingClientRect()` ile, yani ekrana göre alınıyor. Sayfa kaydırmasını
 * ayrıca hesaba katmak gerekmiyor — sürükleme sırasında kaydırılsa bile iki
 * ölçü aynı eksende kalıyor. Yalnızca EKRANA ÇİZİLEN dikdörtgen kapsayıcıya
 * göre çevriliyor.
 *
 * Eşik var: 4 pikselden kısa hareket kement sayılmaz. Aksi hâlde boşluğa
 * yapılan her tıklama (ki o "seçimi bırak" demek) bir mikro-kement olurdu.
 */

/** Kementin başlatılabileceği koşullar ve seçimi kime bildireceği. */
interface Params {
  /** Dokunmatikte kement yok: parmakla sürüklemek sayfayı kaydırmak demek. */
  enabled: boolean;
  /** Kement başlarken var olan seçim — Cmd/Ctrl basılıysa üstüne eklenir. */
  getBase: () => string[];
  /** Her harekette çağrılır; kementin o anki kapsamı. */
  onChange: (keys: string[]) => void;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** `getBoundingClientRect()` sonucunun testte kurulabilen dar hâli. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Kementin DEĞDİĞİ öğeler.
 *
 * Değme yeter, içine almak gerekmez: kullanıcı 40 dosyayı seçerken hepsini
 * tam kapsayan bir dikdörtgen çizmiyor, üstlerinden geçiyor. Sıfır alanlı
 * temas (kenara teğet) sayılmıyor — aksi hâlde eşiği geçen ama yatay hiç
 * hareket etmeyen bir sürükleme, dokunmadığı sütunları da seçerdi.
 */
export function marqueeHits(rect: Rect, items: { key: string; box: Box }[]): string[] {
  const sag = rect.left + rect.width;
  const alt = rect.top + rect.height;
  return items
    .filter(({ box }) => box.left < sag && box.right > rect.left && box.top < alt && box.bottom > rect.top)
    .map(({ key }) => key);
}

const ESIK = 4;

export interface MarqueeSelection {
  /** Kapsayıcıya bağlanır; `position: relative` olmalı (kement onun içine çiziliyor). */
  containerRef: (el: HTMLDivElement | null) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  /** Her seçilebilir öğeye: `ref={marquee.item(key)}`. */
  item: (key: string) => (el: HTMLElement | null) => void;
  /** Çizilecek dikdörtgen; kement etkin değilse null. */
  rect: Rect | null;
}

export function useMarqueeSelection({ enabled, getBase, onChange }: Params): MarqueeSelection {
  const container = useRef<HTMLDivElement | null>(null);
  const items = useRef(new Map<string, HTMLElement>());
  const [rect, setRect] = useState<Rect | null>(null);

  // Sürükleme durumu ref'te: her fare hareketinde yeniden çizim tetiklemek
  // yerine yalnızca dikdörtgen değiştiğinde çiziyoruz.
  const drag = useRef<{ x: number; y: number; base: string[]; aktif: boolean } | null>(null);

  const item = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) items.current.set(key, el);
      else items.current.delete(key);
    },
    []
  );

  const containerRef = useCallback((el: HTMLDivElement | null) => {
    container.current = el;
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Yalnızca sol tuş; sağ tuş menü açıyor, orta tuş yeni sekme.
      if (!enabled || e.button !== 0) return;
      // Bir öğenin üstünden başlıyorsa kement değil, ya seçim ya sürükleme:
      // satırlar `draggable` ve kement onların sürüklenmesini yutardı.
      const hedef = e.target as Node;
      for (const el of items.current.values()) if (el.contains(hedef)) return;

      drag.current = {
        x: e.clientX,
        y: e.clientY,
        // Cmd/Ctrl basılıysa var olan seçimin ÜSTÜNE ekleniyor; tıklama
        // kuralının aynısı (bkz. lib/fileSelection.ts).
        base: e.metaKey || e.ctrlKey ? getBase() : [],
        aktif: false,
      };
    },
    [enabled, getBase]
  );

  useEffect(() => {
    if (!enabled) return;

    const hareket = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;

      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.aktif) {
        if (Math.abs(dx) < ESIK && Math.abs(dy) < ESIK) return;
        d.aktif = true;
        // Kement sürerken metin seçilmesin: tarayıcı varsayılanı, sürüklenen
        // alandaki dosya adlarını maviye boyuyordu.
        document.body.style.userSelect = "none";
      }

      const ekran: Rect = {
        left: Math.min(e.clientX, d.x),
        top: Math.min(e.clientY, d.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };

      const isabet = marqueeHits(
        ekran,
        [...items.current].map(([key, el]) => ({ key, box: el.getBoundingClientRect() }))
      );
      onChange([...new Set([...d.base, ...isabet])]);

      const kap = container.current?.getBoundingClientRect();
      setRect(
        kap
          ? { left: ekran.left - kap.left, top: ekran.top - kap.top, width: ekran.width, height: ekran.height }
          : ekran
      );
    };

    const birak = () => {
      if (drag.current?.aktif) {
        document.body.style.userSelect = "";
        // Fare bırakıldıktan hemen sonra bir `click` olayı geliyor ve o olay
        // "boşluğa tıklandı, seçimi bırak" dinleyicisine kadar kabarıp az önce
        // kementle yapılan seçimi siliyor. Yalnızca O tıklamayı yutuyoruz.
        const yut = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener("click", yut, { capture: true, once: true });
        // Tıklama hiç gelmezse (fare pencere dışında bırakıldıysa) dinleyici
        // asılı kalıp bir sonraki gerçek tıklamayı yutmasın.
        setTimeout(() => window.removeEventListener("click", yut, { capture: true }), 0);
      }
      drag.current = null;
      setRect(null);
    };

    window.addEventListener("mousemove", hareket);
    window.addEventListener("mouseup", birak);
    return () => {
      window.removeEventListener("mousemove", hareket);
      window.removeEventListener("mouseup", birak);
      // Bileşen kement sürerken sökülürse metin seçimi kilitli kalmasın.
      if (drag.current?.aktif) document.body.style.userSelect = "";
    };
  }, [enabled, onChange]);

  return { containerRef, onMouseDown, item, rect };
}
