import { useEffect, useRef, useState } from "react";
import { colors } from "../theme/colors";

interface Props {
  text: string;
  /** Kısaltılmış hâlde kaç satır gösterilsin. */
  lines?: number;
  style?: React.CSSProperties;
}

/**
 * Kart açıklaması: kısaltılmış gösterilir, ÇİFT tıklayınca tamamı açılır.
 *
 * Neden tek tık değil: kart bir bağlantı (bkz. JobCard/ProjectCard — hepsi Link
 * içinde). Açıklamaya tek tıklayınca genişlet/daralt yapmak iki sorun
 * çıkarıyordu:
 *   1. Metin kısaysa ve zaten tamamı görünüyorsa tıklama hiçbir şey göstermiyor,
 *      buna karşılık altındaki kurucu adı/tarih satırı inip kalkıyordu.
 *   2. Kartın her yeri içeri giriyor, açıklama girmiyordu — aynı kartta iki
 *      farklı tıklama anlamı.
 * Artık tek tık her zaman karta girer; çift tık açıklamayı açar. Metin zaten
 * sığıyorsa çift tık da bir şey yapmaz, imleç de "bu tıklanır" demez.
 *
 * Taşma DOM'dan ölçülür (`scrollHeight > clientHeight`), karakter sayısından
 * tahmin edilmez: aynı metin farklı kart genişliğinde farklı sayıda satıra
 * sığıyor.
 */
export default function CardDescription({ text, lines = 2, style }: Props) {
  const c = colors.light;
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // Açıkken ölçmek anlamsız: o hâlde zaten taşma yok.
      if (expanded) return;
      setClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text, lines, expanded]);

  return (
    <p
      ref={ref}
      onDoubleClick={
        clamped || expanded
          ? (e) => {
              // Kart bir Link: çift tık gezinmeyi tetiklemesin.
              e.preventDefault();
              e.stopPropagation();
              setExpanded((prev) => !prev);
            }
          : undefined
      }
      title={clamped && !expanded ? "Tamamını görmek için çift tıkla" : undefined}
      style={{
        color: c.textSecondary,
        fontSize: 15,
        margin: "0 0 10px",
        lineHeight: 1.5,
        minHeight: 0,
        // İmleç yalnızca gerçekten yapacak bir şey varsa değişir.
        cursor: clamped || expanded ? "zoom-in" : "inherit",
        ...(expanded
          ? { flex: 1, overflowY: "auto" as const }
          : {
              display: "-webkit-box",
              WebkitLineClamp: lines,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }),
        ...style,
      }}
    >
      {text}
    </p>
  );
}
