// Ofis haritası: şirketin departmanları üstü açık odalar olarak, izometrik.
//
// Her oda iki katmandan oluşur:
//   1. ODA GÖRSELİ — şimdilik kodla çizilen yer tutucu (zemin, iki duvar,
//      masalar, çalışanlar, bitki). Hazır oda görselleri geldiğinde
//      ODA_GORSELLERI'ne catalogKey → adres eklemek yeter; o oda için çizim
//      yerine görsel basılır, konum ve ölçek aynı izometrik hesaptan gelir.
//      Görsel kuralları: 2:1 izometrik (30°), arka planı şeffaf, ışık sol üstten,
//      oda tabanı tam ODA_GENISLIK × ODA_DERINLIK birime oturur.
//   2. KART — HTML: simge, ad, iş/kişi sayısı, avatarlar, durum ışığı. Görsel
//      değişse de aynı yerde durur, tıklanabilir ve ekran okuyucuya açıktır.

import { useMemo, type ReactElement } from "react";
import { ofisYerlesimi, type Durum, type Oda } from "../../lib/sakin";
import { bas, RENK } from "./ortak";

export interface OfisOdasi {
  id: string;
  ad: string;
  catalogKey?: string;
  durum: Durum;
  /** Kartın ikinci satırı, ör. "12 görev · 4 kişi". */
  ozet: string;
  /** Durumun nedeni (gecikme, kritik stok) — kartın title'ı ve aria. */
  not: string;
  acikIs: number;
  kisiler: string[];
}

/** catalogKey → hazır oda görseli. Boş: hepsi kodla çiziliyor. */
const ODA_GORSELLERI: Partial<Record<string, string>> = {};

const OLCEK = 22;
const CX = 0.866 * OLCEK;
const CY = 0.5 * OLCEK;
const DUVAR = 1.25;

type Nokta3 = [number, number, number];

// Departman türüne göre kart simgesi ve rengi.
const SIMGE: Record<string, { renk: string; zemin: string; yol: string }> = {
  yonetim: { renk: "#5B4BD6", zemin: "#EEEBFC", yol: "M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h1M15 8h1M8 12h1M15 12h1" },
  insan_kaynaklari: { renk: "#D6455B", zemin: "#FCEBEE", yol: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6M20 19v-1a3 3 0 0 0-2-2.8M17 5.2a3 3 0 0 1 0 5.6" },
  finans_muhasebe: { renk: "#1F9D6B", zemin: "#E5F6EF", yol: "M4 6c0 1.7 3.6 3 8 3s8-1.3 8-3-3.6-3-8-3-8 1.3-8 3M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" },
  pazarlama_buyume: { renk: "#2F6FDB", zemin: "#E8F0FC", yol: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14" },
  satis_is_gelistirme: { renk: "#E0662C", zemin: "#FDEEE6", yol: "M4 20h16M7 16v-4M12 16V8M17 16v-7" },
  operasyon_uretim: { renk: "#E09A1A", zemin: "#FDF4E2", yol: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1" },
  bilgi_teknolojileri_yazilim: { renk: "#3A5BA0", zemin: "#E9EEF8", yol: "M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" },
  urun_yonetimi: { renk: "#7C4DDB", zemin: "#F1EBFC", yol: "M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3M12 12l8-4.5M12 12v9M12 12L4 7.5" },
  musteri_iliskileri: { renk: "#C2418A", zemin: "#FAEAF3", yol: "M20.8 8.6a5 5 0 0 0-8.8-3.2 5 5 0 0 0-8.8 3.2c0 5.4 8.8 10.4 8.8 10.4s8.8-5 8.8-10.4" },
  hukuk_uyum: { renk: "#566070", zemin: "#EEF0F3", yol: "M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7M19 7l-3 7a3 3 0 0 0 6 0l-3-7M8 21h8" },
  _ortak: { renk: "#8C5A28", zemin: "#F6E8D6", yol: "M4 10h14v4a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-4M18 11h1a2 2 0 0 1 0 4h-1M8 3v3M12 3v3" },
  _diger: { renk: "#8C5A28", zemin: "#F6E8D6", yol: "M4 8h16v12H4zM9 8V5h6v3" },
};

export function DepartmanSimgesi({ catalogKey, boyut = 36 }: { catalogKey?: string; boyut?: number }) {
  const s = SIMGE[catalogKey ?? ""] ?? SIMGE._diger;
  return (
    <span style={{ width: boyut, height: boyut, borderRadius: 10, background: s.zemin, display: "grid", placeItems: "center", flex: "none" }}>
      <svg width={boyut * 0.55} height={boyut * 0.55} viewBox="0 0 24 24" fill="none" stroke={s.renk} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={s.yol} />
      </svg>
    </span>
  );
}

const TEN = ["#E7C2A2", "#C99A74", "#F0D2B8", "#A97C5A"];
const GIYSI = ["#3A5BA0", "#C0813F", "#2E7D52", "#7C4DDB", "#D6455B", "#3E4858"];

export function OfisHaritasi({
  odalar,
  ortakAlanNotu,
  bayrak,
  onSec,
}: {
  odalar: OfisOdasi[];
  ortakAlanNotu?: string;
  bayrak?: boolean;
  onSec: (oda: OfisOdasi) => void;
}) {
  const plan = useMemo(() => ofisYerlesimi(odalar.length), [odalar.length]);
  const { genislik, derinlik } = plan;
  const ustBosluk = 120;
  const W = (genislik + derinlik) * CX + 60;
  const H = (genislik + derinlik) * CY + ustBosluk + 40;
  const ox = derinlik * CX + 30;
  const P = (x: number, y: number, z: number): [number, number] => [ox + (x - y) * CX, ustBosluk + (x + y) * CY - z * OLCEK];
  const pts = (a: Nokta3[]) => a.map(([x, y, z]) => P(x, y, z).map((v) => v.toFixed(1)).join(",")).join(" ");

  const sekiller: ReactElement[] = [];
  let k = 0;
  const poly = (a: Nokta3[], fill: string, ek: { opacity?: number; stroke?: string } = {}) =>
    sekiller.push(<polygon key={k++} points={pts(a)} fill={fill} opacity={ek.opacity ?? 1} stroke={ek.stroke} strokeWidth={ek.stroke ? 1 : undefined} />);
  const kutu = (x: number, y: number, w: number, d: number, h: number, ust: string, sol: string, sag: string, z0 = 0) => {
    poly([[x + w, y, z0], [x + w, y + d, z0], [x + w, y + d, z0 + h], [x + w, y, z0 + h]], sag);
    poly([[x, y + d, z0], [x + w, y + d, z0], [x + w, y + d, z0 + h], [x, y + d, z0 + h]], sol);
    poly([[x, y, z0 + h], [x + w, y, z0 + h], [x + w, y + d, z0 + h], [x, y + d, z0 + h]], ust);
  };
  const daire = (x: number, y: number, z: number, r: number, fill: string, opacity = 1) => {
    const [cx, cy] = P(x, y, z);
    sekiller.push(<circle key={k++} cx={cx} cy={cy} r={r} fill={fill} opacity={opacity} />);
  };
  const bitki = (x: number, y: number) => {
    kutu(x - 0.18, y - 0.18, 0.36, 0.36, 0.35, "#8A6E52", "#C9B08F", "#A98C6C");
    daire(x, y, 0.75, 9, "#5E9A5A");
    daire(x - 0.12, y - 0.1, 1.0, 7, "#78B070");
    daire(x + 0.05, y + 0.08, 1.15, 5, "#93C489");
  };
  const kisi = (x: number, y: number, renk: string, ten: string) => {
    kutu(x - 0.2, y - 0.2, 0.4, 0.4, 0.4, "#4A5463", "#3E4858", "#323A47"); // sandalye
    daire(x, y, 0.75, 6.5, renk); // gövde
    daire(x, y, 1.05, 4.6, ten); // baş
  };

  // dış zemin
  poly([[0, derinlik, 0], [genislik, derinlik, 0], [genislik, derinlik, -0.5], [0, derinlik, -0.5]], "#E2D8C9");
  poly([[genislik, 0, 0], [genislik, derinlik, 0], [genislik, derinlik, -0.5], [genislik, 0, -0.5]], "#D3C7B5");
  poly([[0, 0, 0], [genislik, 0, 0], [genislik, derinlik, 0], [0, derinlik, 0]], "#F1EADF");

  const ZEMIN: Record<Durum, string> = { ok: "#F6EDDF", warn: "#FAF0D4", crit: "#F8E3DD" };
  const sira = plan.odalar.map((o, i) => ({ o, i })).sort((a, b) => a.o.x + a.o.y - (b.o.x + b.o.y));
  const kartNoktalari: { x: number; y: number }[] = [];

  for (const { o, i } of sira) {
    const oda: OfisOdasi | undefined = o.ortak ? undefined : odalar[i];
    const gorsel = oda?.catalogKey ? ODA_GORSELLERI[oda.catalogKey] : undefined;
    if (gorsel) {
      const [sx] = P(o.x, o.y + o.d, 0);
      const [ex] = P(o.x + o.w, o.y, 0);
      const [, ty] = P(o.x, o.y, DUVAR + 1);
      const [, by] = P(o.x + o.w, o.y + o.d, 0);
      sekiller.push(<image key={k++} href={gorsel} x={sx} y={ty} width={ex - sx} height={by - ty} preserveAspectRatio="xMidYMax meet" />);
    } else {
      odaCiz(o, oda, i);
    }
  }

  function odaCiz(o: Oda, oda: OfisOdasi | undefined, i: number) {
    const { x, y, w, d } = o;
    const zemin = oda ? ZEMIN[oda.durum] : "#F3ECE2";
    poly([[x, y, 0.02], [x + w, y, 0.02], [x + w, y + d, 0.02], [x, y + d, 0.02]], zemin);
    // arka duvarlar
    poly([[x, y, 0], [x + w, y, 0], [x + w, y, DUVAR], [x, y, DUVAR]], "#EFEAE3");
    poly([[x, y, 0], [x, y + d, 0], [x, y + d, DUVAR], [x, y, DUVAR]], "#E1D9CD");
    poly([[x, y, DUVAR], [x + w, y, DUVAR], [x + w, y + 0.1, DUVAR], [x, y + 0.1, DUVAR]], "#FFFFFF");
    poly([[x, y, DUVAR], [x + 0.1, y, DUVAR], [x + 0.1, y + d, DUVAR], [x, y + d, DUVAR]], "#FFFFFF");
    // duvarda pano
    poly([[x + 0.6, y + 0.02, 0.55], [x + 1.8, y + 0.02, 0.55], [x + 1.8, y + 0.02, 1.0], [x + 0.6, y + 0.02, 1.0]], "#FFFFFF", { stroke: "#D7CEC1" });

    if (!oda) {
      // ortak alan: kanepe, sehpa, halı, bitkiler
      const cx = x + w / 2;
      const cy = y + d / 2;
      poly([[cx - 1.4, cy - 1, 0.03], [cx + 1.4, cy - 1, 0.03], [cx + 1.4, cy + 1, 0.03], [cx - 1.4, cy + 1, 0.03]], "#E4DCCF");
      kutu(cx - 1.2, cy - 0.9, 2.4, 0.6, 0.45, "#CFCAC3", "#BDB7AF", "#A9A39B");
      kutu(cx - 1.2, cy - 1.0, 2.4, 0.15, 0.85, "#CFCAC3", "#BDB7AF", "#A9A39B");
      kutu(cx - 0.4, cy + 0.1, 0.8, 0.5, 0.3, "#5A4E43", "#4A4038", "#3D342D");
      kisi(cx + 0.8, cy - 0.5, "#3A5BA0", TEN[1]);
      bitki(x + 0.5, y + 0.5);
      bitki(x + w - 0.5, y + d - 0.5);
      kartNoktalari[i] = { x: P(cx, y + 0.2, DUVAR + 0.4)[0], y: P(cx, y + 0.2, DUVAR + 0.4)[1] };
    } else {
      const masa = Math.max(1, Math.min(4, oda.kisiler.length || Math.ceil(oda.acikIs / 8)));
      const yerler: [number, number][] = [
        [x + 0.9, y + 1.4],
        [x + 2.6, y + 1.4],
        [x + 0.9, y + 2.9],
        [x + 2.6, y + 2.9],
      ];
      for (let m = 0; m < masa; m++) {
        const [mx, my] = yerler[m];
        kutu(mx, my, 1.25, 0.65, 0.5, "#FFFFFF", "#E8E2D8", "#D6CEC1");
        kutu(mx + 0.4, my + 0.08, 0.5, 0.06, 0.38, "#2C333E", "#3E4858", "#2C333E", 0.5);
        if (m < oda.kisiler.length) kisi(mx + 0.62, my + 0.95, GIYSI[(i + m) % GIYSI.length], TEN[(i + m) % TEN.length]);
      }
      // dolap ve bitki
      kutu(x + w - 0.75, y + 0.2, 0.5, 1.1, 0.95, "#C8A97E", "#B8976A", "#A2835A");
      bitki(x + w - 0.5, y + d - 0.5);
      // durum: zeminde hafif ışık halkası
      if (oda.durum !== "ok") {
        const [cx, cy] = P(x + w / 2, y + d / 2, 0.05);
        sekiller.push(<ellipse key={k++} cx={cx} cy={cy} rx={w * CX * 0.9} ry={d * CY * 0.9} fill={RENK[oda.durum]} opacity={0.1} className="sk-oda-isik" />);
      }
      const [kx, ky] = P(x + w / 2, y + 0.2, DUVAR + 0.4);
      kartNoktalari[i] = { x: kx, y: ky };
      if (bayrak && i === 0) {
        const [bx, by] = P(x + 0.4, y + 0.4, DUVAR);
        sekiller.push(<line key={k++} x1={bx} y1={by} x2={bx} y2={by - 44} stroke="#1C222C" strokeWidth={2} />);
        sekiller.push(<polygon key={k++} points={`${bx},${by - 44} ${bx + 24},${by - 37} ${bx},${by - 30}`} fill="#C0813F" />);
      }
    }
    // ön cam duvarlar
    poly([[x, y + d, 0], [x + w, y + d, 0], [x + w, y + d, DUVAR * 0.8], [x, y + d, DUVAR * 0.8]], "#FFFFFF", { opacity: 0.28, stroke: "#C9D3DC" });
    poly([[x + w, y, 0], [x + w, y + d, 0], [x + w, y + d, DUVAR * 0.8], [x + w, y, DUVAR * 0.8]], "#FFFFFF", { opacity: 0.22, stroke: "#C9D3DC" });
  }

  const ortakIndeks = plan.odalar.findIndex((o) => o.ortak);

  return (
    <div className="sk-ofis">
      <svg viewBox={`0 0 ${W.toFixed(0)} ${H.toFixed(0)}`} aria-hidden="true">
        {sekiller}
      </svg>
      {odalar.map((oda, i) => {
        const n = kartNoktalari[i];
        if (!n) return null;
        return (
          <button
            key={oda.id}
            type="button"
            className="sk-oda-kart"
            style={{ left: `${(n.x / W) * 100}%`, top: `${(n.y / H) * 100}%` }}
            onClick={() => onSec(oda)}
            title={oda.not}
            aria-label={`${oda.ad}: ${oda.ozet}. ${oda.not}`}
          >
            <DepartmanSimgesi catalogKey={oda.catalogKey} />
            <span className="sk-oda-metin">
              <span className="sk-oda-ad">
                {oda.durum !== "ok" && <i className={`sk-light ${oda.durum}`} />}
                {oda.ad}
              </span>
              <span className="sk-oda-ozet">{oda.ozet}</span>
            </span>
            {oda.kisiler.length > 0 && (
              <span className="sk-avatarlar" aria-hidden="true">
                {oda.kisiler.slice(0, 2).map((ad, j) => (
                  <span key={j} className="sk-avatar" style={{ background: GIYSI[(i + j) % GIYSI.length] }}>
                    {bas(ad)}
                  </span>
                ))}
                {oda.kisiler.length > 2 && <span className="sk-avatar arti">+{oda.kisiler.length - 2}</span>}
              </span>
            )}
          </button>
        );
      })}
      {ortakIndeks >= 0 && kartNoktalari[ortakIndeks] && (
        <div
          className="sk-oda-kart ortak"
          style={{ left: `${(kartNoktalari[ortakIndeks].x / W) * 100}%`, top: `${(kartNoktalari[ortakIndeks].y / H) * 100}%` }}
        >
          <DepartmanSimgesi catalogKey="_ortak" />
          <span className="sk-oda-metin">
            <span className="sk-oda-ad">Ortak alan</span>
            <span className="sk-oda-ozet">{ortakAlanNotu ?? "Kahve molası"}</span>
          </span>
        </div>
      )}
    </div>
  );
}

