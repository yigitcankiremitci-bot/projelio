"use client";

import { useRef, useState } from "react";
import { TURKIYE_IL_ADLARI, TURKIYE_IL_YOLLARI, TURKIYE_VIEWBOX } from "@/lib/harita/turkiyeIlYollari";

/**
 * Müşteriler kartındaki Türkiye haritası; paneldeki MusteriHaritaOzeti'nin
 * çizimiyle aynı (il dolgusu çizgi rengi, sınırlar yüzey rengi, üzerine
 * gelince il adı). Ziyaretçinin müşterisi olmadığı için her il 0; tıklamak
 * "üyelikle açılır" penceresini açar.
 *
 * Ayrı dosya ve tembel yükleniyor (bkz. Misafir.tsx): 81 ilin yolları ~110 KB.
 */
export default function MisafirHarita({ etiket, sayiMetni, onAc }: { etiket: string; sayiMetni: string; onAc: () => void }) {
  const kap = useRef<HTMLDivElement>(null);
  const [uzerinde, setUzerinde] = useState<{ plaka: number; x: number; y: number } | null>(null);
  const genislik = kap.current?.clientWidth ?? 0;

  return (
    <div
      ref={kap}
      className="mf-harita"
      role="button"
      tabIndex={0}
      aria-label={etiket}
      onClick={onAc}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onAc();
        }
      }}
      onMouseLeave={() => setUzerinde(null)}
    >
      <svg viewBox={TURKIYE_VIEWBOX} width="100%" height="100%" aria-hidden="true">
        {TURKIYE_IL_YOLLARI.map(([plaka, d]) => {
          const secik = uzerinde?.plaka === plaka;
          return (
            <path
              key={plaka}
              d={d}
              fill={secik ? "#3a4354" : "#2a3140"}
              stroke={secik ? "#f1f3f5" : "#1b2028"}
              strokeWidth={secik ? 1.6 : 0.8}
              strokeLinejoin="round"
              onMouseMove={(e) => {
                const r = kap.current?.getBoundingClientRect();
                if (r) setUzerinde({ plaka, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
            />
          );
        })}
      </svg>
      {uzerinde && (
        <div
          className="mf-harita-ipucu"
          // Sağ kenara yakınsa ipucu imlecin soluna geçer, kartın dışına taşmasın.
          style={{
            ...(uzerinde.x > genislik - 130 ? { right: genislik - uzerinde.x + 10 } : { left: uzerinde.x + 12 }),
            top: Math.max(0, uzerinde.y - 40),
          }}
        >
          <b>{TURKIYE_IL_ADLARI[uzerinde.plaka - 1]}</b>
          <span>{sayiMetni}</span>
        </div>
      )}
    </div>
  );
}
