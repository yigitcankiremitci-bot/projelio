import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";

/**
 * Analiz sekmesinin iki grafiği: zaman çizgisi ve çubuk. Bağımlılıksız SVG
 * (bütçedeki NakitAkisGrafigi ile aynı yol — projede grafik kütüphanesi yok).
 *
 * Kurallar (her ikisi için):
 *   · Tek seri, tek eksen. Başlık seriyi adlandırır; lejant yok.
 *   · Izgara ve eksen silik, veri işareti ana renk (palet: c.primary).
 *   · Üzerine gelince ipucu: çizgide en yakın nokta + dikey kılavuz, çubukta
 *     o çubuk. İsabet alanı işaretten geniş (çubuk sütununun tamamı).
 *   · "Tablo" düğmesi aynı veriyi tablo olarak gösterir — renk ve şekil
 *     okuyamayan için ve tam sayıyı görmek isteyen için.
 *   · SVG piksel genişlikte çizilir (viewBox esnetmez): yazılar esnemesin.
 */

export interface GrafikNoktasi {
  /** Çizgide sayısal x (zaman ms ya da saat); çubukta sıra. */
  x: number;
  y: number;
  /** İpucunda ve tabloda görünen x yazısı. */
  xYazi: string;
}

interface OrtakProps {
  baslik: string;
  altBaslik?: string;
  noktalar: GrafikNoktasi[];
  yBicim: (n: number) => string;
  /** Eksen altına yazılacak x etiketi (az sayıda; çakışmayı bileşen önler). */
  xEtiket: (n: GrafikNoktasi) => string;
  bos: ReactNode;
  yukseklik?: number;
  /** Seri rengi — bölümün rengi (varsayılan tema ana rengi). */
  renk?: string;
}

const SOL = 44;
const SAG = 10;
const UST = 10;
const ALT = 22;

function useGenislik<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [genislik, setGenislik] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const gozlem = new ResizeObserver(([g]) => setGenislik(Math.max(240, Math.floor(g.contentRect.width))));
    gozlem.observe(el);
    return () => gozlem.disconnect();
  }, []);
  return [ref, genislik];
}

/** 0'dan başlayan, "yuvarlak" 4 basamaklı eksen. */
function yEkseni(enBuyuk: number): number[] {
  if (enBuyuk <= 0) return [0, 1];
  const ham = enBuyuk / 4;
  const us = Math.pow(10, Math.floor(Math.log10(ham)));
  const adim = [1, 2, 2.5, 5, 10].map((k) => k * us).find((a) => a >= ham) ?? ham;
  return Array.from({ length: Math.ceil(enBuyuk / adim) + 1 }, (_, i) => i * adim);
}

/** Etiketleri çakışmayacak kadar seyrelt: en fazla ~her 70 px'e bir. */
function seyrek<T>(liste: T[], genislik: number): Set<number> {
  const adet = Math.max(2, Math.floor(genislik / 70));
  const adim = Math.max(1, Math.ceil(liste.length / adet));
  const secilen = new Set<number>();
  for (let i = 0; i < liste.length; i += adim) secilen.add(i);
  secilen.add(liste.length - 1);
  return secilen;
}

function Cerceve({
  baslik,
  altBaslik,
  tablo,
  setTablo,
  children,
}: {
  baslik: string;
  altBaslik?: string;
  tablo: boolean;
  setTablo: (v: boolean) => void;
  children: ReactNode;
}) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        background: c.surface,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary }}>{baslik}</span>
          {altBaslik && <span style={{ fontSize: 11, color: c.textSecondary }}>{altBaslik}</span>}
        </div>
        <button
          type="button"
          onClick={() => setTablo(!tablo)}
          style={{ fontSize: 11, color: c.textSecondary, background: "transparent", border: "none", cursor: "pointer" }}
        >
          {tablo ? t("Grafik") : t("Tablo")}
        </button>
      </div>
      {children}
    </div>
  );
}

function Tablo({ noktalar, yBicim }: { noktalar: GrafikNoktasi[]; yBicim: (n: number) => string }) {
  const c = useThemeColors();
  return (
    <div style={{ maxHeight: 220, overflowY: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <tbody>
          {[...noktalar].reverse().map((n, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
              <td style={{ padding: "4px 2px", color: c.textSecondary }}>{n.xYazi}</td>
              <td style={{ padding: "4px 2px", color: c.textPrimary, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {yBicim(n.y)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ipucu({ x, y, ust, alt }: { x: number; y: number; ust: string; alt: string }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, calc(-100% - 8px))",
        pointerEvents: "none",
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 6,
        padding: "4px 8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        whiteSpace: "nowrap",
        zIndex: 2,
      }}
    >
      <div style={{ fontSize: 11, color: c.textSecondary }}>{ust}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{alt}</div>
    </div>
  );
}

/** Zaman çizgisi: x sürekli (zaman/saat), 2 px çizgi, uç noktası işaretli. */
export function CizgiGrafik({ baslik, altBaslik, noktalar, yBicim, xEtiket, bos, yukseklik = 180, renk }: OrtakProps) {
  const c = useThemeColors();
  const seri = renk ?? c.primary;
  const [ref, genislik] = useGenislik<HTMLDivElement>();
  const [tablo, setTablo] = useState(false);
  const [secili, setSecili] = useState<number | null>(null);

  const olcek = useMemo(() => {
    const xs = noktalar.map((n) => n.x);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    const ticks = yEkseni(Math.max(0, ...noktalar.map((n) => n.y)));
    const yMax = ticks[ticks.length - 1];
    const ic = genislik - SOL - SAG;
    const yIc = yukseklik - UST - ALT;
    const px = (x: number) => SOL + (xMax === xMin ? ic / 2 : ((x - xMin) / (xMax - xMin)) * ic);
    const py = (y: number) => UST + yIc - (yMax ? (y / yMax) * yIc : 0);
    return { px, py, ticks };
  }, [noktalar, genislik, yukseklik]);

  const icerik =
    noktalar.length < 2 ? (
      <div style={{ fontSize: 12, color: c.textSecondary, padding: "24px 4px", textAlign: "center" }}>{bos}</div>
    ) : tablo ? (
      <Tablo noktalar={noktalar} yBicim={yBicim} />
    ) : (
      <div style={{ position: "relative", width: "100%" }} onMouseLeave={() => setSecili(null)}>
        <svg
          width={genislik}
          height={yukseklik}
          style={{ display: "block" }}
          onMouseMove={(e) => {
            const kutu = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const mx = e.clientX - kutu.left;
            let en = 0;
            noktalar.forEach((n, i) => {
              if (Math.abs(olcek.px(n.x) - mx) < Math.abs(olcek.px(noktalar[en].x) - mx)) en = i;
            });
            setSecili(en);
          }}
          role="img"
          aria-label={baslik}
        >
          {olcek.ticks.map((tk) => (
            <g key={tk}>
              <line x1={SOL} x2={genislik - SAG} y1={olcek.py(tk)} y2={olcek.py(tk)} stroke={c.border} strokeWidth={1} />
              <text x={SOL - 6} y={olcek.py(tk) + 4} textAnchor="end" fontSize={10} fill={c.textSecondary}>
                {yBicim(tk)}
              </text>
            </g>
          ))}
          {Array.from(seyrek(noktalar, genislik - SOL - SAG)).map((i) => (
            <text
              key={i}
              x={olcek.px(noktalar[i].x)}
              y={yukseklik - 6}
              textAnchor={i === 0 ? "start" : i === noktalar.length - 1 ? "end" : "middle"}
              fontSize={10}
              fill={c.textSecondary}
            >
              {xEtiket(noktalar[i])}
            </text>
          ))}
          <polyline
            points={noktalar.map((n) => `${olcek.px(n.x)},${olcek.py(n.y)}`).join(" ")}
            fill="none"
            stroke={seri}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Son değer her zaman işaretli: "şu an nerede" sorusunun cevabı. */}
          <circle
            cx={olcek.px(noktalar[noktalar.length - 1].x)}
            cy={olcek.py(noktalar[noktalar.length - 1].y)}
            r={4}
            fill={seri}
            stroke={c.surface}
            strokeWidth={2}
          />
          {secili !== null && (
            <>
              <line
                x1={olcek.px(noktalar[secili].x)}
                x2={olcek.px(noktalar[secili].x)}
                y1={UST}
                y2={yukseklik - ALT}
                stroke={c.textSecondary}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <circle
                cx={olcek.px(noktalar[secili].x)}
                cy={olcek.py(noktalar[secili].y)}
                r={5}
                fill={seri}
                stroke={c.surface}
                strokeWidth={2}
              />
            </>
          )}
        </svg>
        {secili !== null && (
          <Ipucu
            x={olcek.px(noktalar[secili].x)}
            y={olcek.py(noktalar[secili].y)}
            ust={noktalar[secili].xYazi}
            alt={yBicim(noktalar[secili].y)}
          />
        )}
      </div>
    );

  return (
    <Cerceve baslik={baslik} altBaslik={altBaslik} tablo={tablo} setTablo={setTablo}>
      {/* Genişlik ölçümü her görünümde bağlı kalsın: tabloya geçip dönünce
          ya da veri sonradan gelince grafik eski genişlikte kalmasın. */}
      <div ref={ref} style={{ width: "100%" }}>
        {icerik}
      </div>
    </Cerceve>
  );
}

/** Çubuk grafik: kategoriler sırayla, üst köşeleri yuvarlak, 2 px aralık. */
export function CubukGrafik({
  baslik,
  altBaslik,
  noktalar,
  yBicim,
  xEtiket,
  bos,
  yukseklik = 180,
  ekIpucu,
  renk,
}: OrtakProps & { ekIpucu?: (n: GrafikNoktasi) => string }) {
  const c = useThemeColors();
  const seri = renk ?? c.primary;
  const [ref, genislik] = useGenislik<HTMLDivElement>();
  const [tablo, setTablo] = useState(false);
  const [secili, setSecili] = useState<number | null>(null);

  const ticks = useMemo(() => yEkseni(Math.max(0, ...noktalar.map((n) => n.y))), [noktalar]);
  const yMax = ticks[ticks.length - 1];
  const ic = genislik - SOL - SAG;
  const yIc = yukseklik - UST - ALT;
  const sutun = noktalar.length ? ic / noktalar.length : ic;
  const cubuk = Math.max(2, Math.min(28, sutun - 2));
  const py = (y: number) => UST + yIc - (yMax ? (y / yMax) * yIc : 0);
  const etiketler = seyrek(noktalar, ic);

  const icerik =
    noktalar.length === 0 ? (
      <div style={{ fontSize: 12, color: c.textSecondary, padding: "24px 4px", textAlign: "center" }}>{bos}</div>
    ) : tablo ? (
      <Tablo noktalar={noktalar} yBicim={yBicim} />
    ) : (
      <div style={{ position: "relative", width: "100%" }} onMouseLeave={() => setSecili(null)}>
        <svg width={genislik} height={yukseklik} style={{ display: "block" }} role="img" aria-label={baslik}>
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={SOL} x2={genislik - SAG} y1={py(tk)} y2={py(tk)} stroke={c.border} strokeWidth={1} />
              <text x={SOL - 6} y={py(tk) + 4} textAnchor="end" fontSize={10} fill={c.textSecondary}>
                {yBicim(tk)}
              </text>
            </g>
          ))}
          {noktalar.map((n, i) => {
            const orta = SOL + sutun * i + sutun / 2;
            const ust = py(n.y);
            const h = Math.max(0, UST + yIc - ust);
            const r = Math.min(4, cubuk / 2, h);
            return (
              <g key={i}>
                {/* İsabet alanı: sütunun tamamı, çubuk kısa olsa da yakalanır. */}
                <rect
                  x={SOL + sutun * i}
                  y={UST}
                  width={sutun}
                  height={yIc}
                  fill="transparent"
                  onMouseEnter={() => setSecili(i)}
                />
                {h > 0 && (
                  <path
                    d={`M${orta - cubuk / 2},${UST + yIc} V${ust + r} Q${orta - cubuk / 2},${ust} ${orta - cubuk / 2 + r},${ust} H${orta + cubuk / 2 - r} Q${orta + cubuk / 2},${ust} ${orta + cubuk / 2},${ust + r} V${UST + yIc} Z`}
                    fill={seri}
                    opacity={secili === null || secili === i ? 1 : 0.55}
                    pointerEvents="none"
                  />
                )}
                {etiketler.has(i) && (
                  <text x={orta} y={yukseklik - 6} textAnchor="middle" fontSize={10} fill={c.textSecondary}>
                    {xEtiket(n)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {secili !== null && (
          <Ipucu
            x={SOL + sutun * secili + sutun / 2}
            y={py(noktalar[secili].y)}
            ust={noktalar[secili].xYazi}
            alt={`${yBicim(noktalar[secili].y)}${ekIpucu ? ` · ${ekIpucu(noktalar[secili])}` : ""}`}
          />
        )}
      </div>
    );

  return (
    <Cerceve baslik={baslik} altBaslik={altBaslik} tablo={tablo} setTablo={setTablo}>
      {/* Genişlik ölçümü her görünümde bağlı kalsın: tabloya geçip dönünce
          ya da veri sonradan gelince grafik eski genişlikte kalmasın. */}
      <div ref={ref} style={{ width: "100%" }}>
        {icerik}
      </div>
    </Cerceve>
  );
}
