import { useEffect, useRef } from "react";
import type { Product } from "@projelio/shared";
import ProductCard from "./ProductCard";
import { useDragScroll } from "../lib/useDragScroll";
import { pageGutter } from "../lib/layout";

interface Props {
  products: Product[];
  onOpen: (product: Product) => void;
  onCoverUpdated: () => void;
}

/**
 * Telefondaki anasayfada ürün/hizmetlerin üst üste binen "deste" şeridi.
 *
 * Kartlar birbirinin üstüne biner; ortadaki kart önde ve tam boyda durur,
 * kenara doğru gidenler küçülür, hafifçe döner ve geriye çekilir. Kaydırdıkça
 * öndeki kart değişir — şerit hem kompakt kalıyor hem de her an tek bir ürün
 * öne çıkıyor.
 *
 * Görünüm React durumuyla DEĞİL, kaydırma olayında doğrudan stil yazarak
 * güncelleniyor: her kaydırma karesinde tüm listeyi yeniden çizmek telefonda
 * takılmaya yol açardı. requestAnimationFrame ile kare başına bir kez.
 */
const CARD_WIDTH = 160;
/** Komşu kartın öndekinin altına ne kadar girdiği. */
const OVERLAP = 58;
const STEP = CARD_WIDTH - OVERLAP;

export default function ProductStack({ products, onOpen, onCoverUpdated }: Props) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useDragScroll<HTMLDivElement>(true, stripRef);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    // Liste kısaldıysa eski kartların kopuk referansları kalmasın.
    itemRefs.current.length = products.length;
    // Hareket azaltma tercihi açıksa dönüş yok; yalnızca ölçek ve sıra kalır.
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let frame = 0;

    const paint = () => {
      frame = 0;
      const center = strip.scrollLeft + strip.clientWidth / 2;
      for (const el of itemRefs.current) {
        if (!el) continue;
        const d = (el.offsetLeft + el.offsetWidth / 2 - center) / STEP;
        const a = Math.min(Math.abs(d), 3);
        const yon = Math.max(-2, Math.min(2, d));
        const scale = 1 - Math.min(a, 2) * 0.11;
        const rotate = reduce ? 0 : -yon * 9;
        el.style.transform = `translateY(${a * 7}px) scale(${scale}) rotateY(${rotate}deg)`;
        el.style.zIndex = String(100 - Math.round(a * 10));
        el.style.opacity = String(1 - Math.max(0, a - 1) * 0.4);
        // Öndeki kartın gölgesi derin, arkadakiler zemine yakın.
        const g = Math.max(0, 1 - a / 2);
        el.style.boxShadow = `0 ${4 + g * 10}px ${10 + g * 18}px rgba(28,34,44,${(0.14 + g * 0.2).toFixed(3)})`;
        el.dataset.front = a < 0.5 ? "1" : "";
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    paint();
    strip.addEventListener("scroll", schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(strip);
    return () => {
      strip.removeEventListener("scroll", schedule);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [products]);

  /** Arkadaki karta dokunmak onu açmaz, öne getirir. */
  const bringToFront = (el: HTMLDivElement) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.scrollTo({ left: el.offsetLeft + el.offsetWidth / 2 - strip.clientWidth / 2, behavior: "smooth" });
  };

  // Baştaki ve sondaki boşluk: ilk ve son kart da ortaya gelip öne çıkabilsin.
  // padding yerine ayrı öğe, çünkü Safari yatay taşan flex kutusunda sondaki
  // dolguyu kaydırma alanına katmıyor.
  const spacer = <div aria-hidden style={{ flex: `0 0 calc(50% - ${CARD_WIDTH / 2}px)` }} />;

  return (
    <div
      ref={dragRef}
      style={{
        position: "relative",
        display: "flex",
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        scrollbarWidth: "none",
        WebkitOverflowScrolling: "touch",
        perspective: 900,
        // Gölge ve aşağı itilen arka kartlar kırpılmasın. Yatayda sayfa
        // dolgusunu aşıp ekran kenarına kadar uzanıyor: kartlar kenardan
        // kayarak girip çıkıyor.
        padding: "6px 0 22px",
        margin: `0 -${pageGutter(false)}px`,
      }}
    >
      {spacer}
      {products.map((p, i) => (
        <div
          key={p.id}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          onClickCapture={(e) => {
            const el = e.currentTarget;
            if (el.dataset.front) return;
            e.preventDefault();
            e.stopPropagation();
            bringToFront(el);
          }}
          style={{
            position: "relative",
            flex: `0 0 ${CARD_WIDTH}px`,
            width: CARD_WIDTH,
            marginLeft: i === 0 ? 0 : -OVERLAP,
            borderRadius: 12,
            scrollSnapAlign: "center",
            transformOrigin: "center bottom",
            transition: "box-shadow 200ms ease",
            willChange: "transform",
          }}
        >
          <ProductCard product={p} compact onOpen={() => onOpen(p)} onCoverUpdated={onCoverUpdated} />
        </div>
      ))}
      {spacer}
    </div>
  );
}
