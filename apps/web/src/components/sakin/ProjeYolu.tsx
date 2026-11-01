// Proje yolu: projenin çıktıları bir manzaradaki yolun aşamaları (bkz. pages/Sakin.tsx).
import type { Task } from "@projelio/shared";
import { Tik } from "./ortak";

// ------------------------------------------------------------------ proje yolu

export interface Asama {
  id: string;
  ad: string;
  gorevler: Task[];
}

export function ProjeYolu({ asamalar, secili, onSec }: { asamalar: Asama[]; secili: string; onSec: (id: string) => void }) {
  const n = asamalar.length;
  const noktalar = asamalar.map((_, i) => {
    const x = n === 1 ? 500 : 90 + (i * 820) / (n - 1);
    const y = n === 1 ? 150 : i % 2 === 0 ? 195 : 95;
    return [x, y] as const;
  });
  const bitti = asamalar.map((a) => a.gorevler.length > 0 && a.gorevler.every((t) => t.status === "completed"));
  let simdiki = bitti.indexOf(false);
  if (simdiki === -1) simdiki = n - 1;
  const agaclar = [[40, 230], [180, 170], [230, 255], [420, 150], [610, 140], [640, 262], [820, 205], [985, 150], [390, 280], [120, 290], [560, 290], [870, 285]];

  return (
    <div className="sk-road">
      <div className="sk-road-in">
        <svg viewBox="0 0 1000 330" aria-hidden="true">
          <path d="M0 330 L0 210 Q120 150 260 190 T520 175 T780 160 T1000 150 L1000 330 Z" fill="#EAE2D4" />
          <path d="M0 330 L0 260 Q160 220 330 250 T660 240 T1000 230 L1000 330 Z" fill="#E2D8C7" />
          {agaclar.map(([x, y], i) => (
            <g key={i}>
              <ellipse cx={x} cy={y + 2} rx={11} ry={4} fill="#CFC3AE" />
              <rect x={x - 2} y={y - 12} width={4} height={12} fill="#9C8466" />
              <circle cx={x} cy={y - 16} r={i % 3 === 0 ? 14 : 11} fill={i % 2 ? "#86A880" : "#9DBB95"} />
            </g>
          ))}
          {noktalar.slice(0, -1).map(([x0, y0], i) => {
            const [x1, y1] = noktalar[i + 1];
            const mx = (x0 + x1) / 2;
            const d = `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
            return (
              <g key={i}>
                <path d={d} fill="none" stroke="#fff" strokeWidth={22} strokeLinecap="round" />
                <path d={d} fill="none" stroke={bitti[i] ? "#C0813F" : "#CFC5B5"} strokeWidth={12} strokeLinecap="round" />
                {!bitti[i] && <path d={d} fill="none" stroke="#fff" strokeWidth={2} strokeDasharray="10 12" />}
              </g>
            );
          })}
          {n > 0 && (
            <g>
              <line x1={noktalar[n - 1][0] + 32} y1={noktalar[n - 1][1]} x2={noktalar[n - 1][0] + 32} y2={noktalar[n - 1][1] - 62} stroke="#1C222C" strokeWidth={3} />
              <polygon
                points={`${noktalar[n - 1][0] + 32},${noktalar[n - 1][1] - 62} ${noktalar[n - 1][0] + 72},${noktalar[n - 1][1] - 50} ${noktalar[n - 1][0] + 32},${noktalar[n - 1][1] - 38}`}
                fill={bitti.every(Boolean) ? "#2E9A5B" : "#C0813F"}
              />
            </g>
          )}
        </svg>
        {asamalar.map((a, i) => {
          const tamam = a.gorevler.filter((t) => t.status === "completed").length;
          const durum = bitti[i] ? "done" : i === simdiki ? "cur" : "next";
          return (
            <div key={a.id} className="sk-stn" style={{ left: `${noktalar[i][0] / 10}%`, top: `${(noktalar[i][1] / 330) * 100}%` }}>
              <button
                type="button"
                className={`sk-st ${durum}${a.id === secili ? " sel" : ""}`}
                onClick={() => onSec(a.id)}
                aria-label={`${a.ad}: ${tamam} / ${a.gorevler.length} görev`}
              >
                {bitti[i] ? <Tik /> : <span>{i + 1}</span>}
              </button>
              <div className="sk-stn-label">
                <div className="sk-stn-name">{a.ad}</div>
                <div className="sk-stn-sub">{bitti[i] ? "Tamam" : `${tamam} / ${a.gorevler.length} görev`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

