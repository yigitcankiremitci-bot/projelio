// Ana sayfadaki 3D ofis davet kartı: şirket ana sayfasında (OrganizationDetail
// "Ana sayfa" sekmesi) ve serbest çalışanın anasayfasında (Dashboard "İşler")
// bölümlerin ortasında durur, tıklanınca /yeni'de doğru ofisi açar.
//
// Ofis sayfasına kenar çubuğunda bir bağlantı yok; kullanıcıların çoğu ofisin
// varlığından ancak bu kartla haberdar oluyor. O yüzden bilerek büyük ve
// görsel: sağdaki izometrik çizim sahnenin küçük bir benzeri (masalar,
// çalışan karakterler, pencereler) — three.js YÜKLENMEZ, yalnızca SVG.
//
// Zemin her iki temada da koyu: çizim açık zeminde sönük kalıyordu. Renkler
// paletin AÇIK temasından alınır (koyu temada primaryDark açık bir slate'e
// dönüyor, üstündeki beyaz yazı okunmuyordu).

import { Link } from "react-router-dom";
import { colors } from "@projelio/shared";
import { useT } from "../lib/i18n";
import { useIsDesktop } from "../lib/useIsDesktop";
import "./OfisDavetKarti.css";

const P = colors.light;

type Props =
  | { tur: "sirket"; organizationId: string }
  | { tur: "studyo" };

export default function OfisDavetKarti(props: Props) {
  const t = useT();
  const isDesktop = useIsDesktop();
  const sirket = props.tur === "sirket";
  const hedef = sirket ? `/yeni?ofis=${encodeURIComponent(props.organizationId)}` : "/yeni?ofis=studyo";

  const baslik = sirket ? t("Şirketin 3D ofisi seni bekliyor") : t("Stüdyon seni bekliyor");
  const aciklama = sirket
    ? t("Her departman bir oda, ekibin masasında. Kimin ne üzerinde çalıştığını canlı gör, panolardan projelere geç, ofisi birlikte döşe.")
    : t("Her işin bir oda, projelerin birer çalışma istasyonu. Karakterini seç, görev bitirdikçe puan topla, stüdyonu dilediğin gibi döşe.");
  const ozellikler = sirket
    ? [t("Canlı ekip"), t("Panodan projeye"), t("Ortak oda düzeni")]
    : [t("İş başına oda"), t("Puanla eşya"), t("Kendi karakterin")];

  return (
    <Link
      to={hedef}
      className="ofis-davet"
      aria-label={`${baslik} — ${sirket ? t("Ofise gir") : t("Stüdyoya gir")}`}
      style={{
        background: `radial-gradient(120% 140% at 85% 20%, ${P.primary} 0%, ${P.primaryDark} 62%)`,
        color: P.surface,
        flexDirection: isDesktop ? "row" : "column",
        minHeight: isDesktop ? 300 : undefined,
      }}
    >
      <div className="ofis-davet__metin" style={{ padding: isDesktop ? "36px 0 36px 40px" : "26px 22px 6px" }}>
        <span className="ofis-davet__rozet" style={{ color: P.accent, borderColor: `${P.accent}66`, background: `${P.accent}1f` }}>
          <span className="ofis-davet__nokta" style={{ background: P.accent }} />
          {t("Yeni · 3D ofis")}
        </span>
        <h2 style={{ fontSize: isDesktop ? 30 : 23 }}>{baslik}</h2>
        <p>{aciklama}</p>
        <ul>
          {ozellikler.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <span className="ofis-davet__dugme" style={{ background: P.accent, color: P.surface }}>
          {sirket ? t("Ofise gir") : t("Stüdyoya gir")}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className="ofis-davet__sahne" style={{ height: isDesktop ? undefined : 220 }}>
        <OfisCizimi />
      </div>
    </Link>
  );
}

// ------------------------------------------------------------------ çizim

// İzometrik izdüşüm: (x, y) zemin, z yükseklik. Birim ~ 1 metre.
const S = 26;
const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const iz = (x: number, y: number, z = 0) => `${((x - y) * COS * S).toFixed(1)},${((x + y) * SIN * S - z * S).toFixed(1)}`;
const poli = (...n: [number, number, number][]) => n.map(([x, y, z]) => iz(x, y, z)).join(" ");

/** Kutu: üst + iki görünen yan yüz. Yanlar üstün koyulaşmış hâli. */
function Kutu({ x, y, z = 0, w, d, h, renk }: { x: number; y: number; z?: number; w: number; d: number; h: number; renk: string }) {
  const u = z + h;
  return (
    <g>
      <polygon points={poli([x, y + d, z], [x + w, y + d, z], [x + w, y + d, u], [x, y + d, u])} fill={renk} />
      <polygon points={poli([x, y + d, z], [x + w, y + d, z], [x + w, y + d, u], [x, y + d, u])} fill="#000" opacity={0.18} />
      <polygon points={poli([x + w, y, z], [x + w, y + d, z], [x + w, y + d, u], [x + w, y, u])} fill={renk} />
      <polygon points={poli([x + w, y, z], [x + w, y + d, z], [x + w, y + d, u], [x + w, y, u])} fill="#000" opacity={0.34} />
      <polygon points={poli([x, y, u], [x + w, y, u], [x + w, y + d, u], [x, y + d, u])} fill={renk} />
    </g>
  );
}

/** Masa + ekran + oturan karakter. `gecikme` karakterlerin aynı anda sallanmaması için. */
function Masa({ x, y, giysi, gecikme }: { x: number; y: number; giysi: string; gecikme: number }) {
  const [hx, hy] = iz(x + 0.7, y + 1.55, 1.55).split(",").map(Number);
  return (
    <g>
      <Kutu x={x} y={y} w={1.6} d={0.8} h={0.72} renk={P.surface} />
      {/* ekran */}
      <Kutu x={x + 0.5} y={y + 0.15} z={0.72} w={0.6} d={0.08} h={0.42} renk={P.primaryDark} />
      <polygon
        className="ofis-davet__ekran"
        style={{ animationDelay: `${gecikme}s` }}
        points={poli([x + 0.54, y + 0.23, 0.77], [x + 1.06, y + 0.23, 0.77], [x + 1.06, y + 0.23, 1.1], [x + 0.54, y + 0.23, 1.1])}
        fill={P.accent}
      />
      {/* sandalye + karakter */}
      <Kutu x={x + 0.45} y={y + 1.05} w={0.5} d={0.5} h={0.45} renk={P.textSecondary} />
      <g className="ofis-davet__kisi" style={{ animationDelay: `${gecikme}s` }}>
        <Kutu x={x + 0.5} y={y + 1.12} z={0.45} w={0.4} d={0.32} h={0.62} renk={giysi} />
        <circle cx={hx} cy={hy} r={6.2} fill="#E8B894" />
        <path d={`M${hx - 6.2},${hy - 1} a6.2,6.2 0 0 1 12.4,0 z`} fill={P.primaryDark} />
      </g>
    </g>
  );
}

function Bitki({ x, y }: { x: number; y: number }) {
  const [px, py] = iz(x + 0.25, y + 0.25, 1.05).split(",").map(Number);
  return (
    <g>
      <Kutu x={x} y={y} w={0.5} d={0.5} h={0.45} renk={P.accentDark} />
      <g className="ofis-davet__yaprak">
        <circle cx={px} cy={py} r={11} fill={P.completed} />
        <circle cx={px - 6} cy={py + 5} r={7} fill={P.success} />
        <circle cx={px + 6} cy={py + 3} r={7} fill={P.success} opacity={0.85} />
      </g>
    </g>
  );
}

function OfisCizimi() {
  const W = 9;
  const D = 7;
  const H = 2.6;
  const [bx, by] = iz(5.7, 2.55, 2.45).split(",").map(Number);
  return (
    <svg viewBox="-172 -82 388 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {/* zemin + karo çizgileri */}
      <polygon points={poli([0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0])} fill={P.listeSatirAlt} />
      {Array.from({ length: W - 1 }, (_, i) => (
        <polyline key={`a${i}`} points={poli([i + 1, 0, 0], [i + 1, D, 0])} stroke={P.border} strokeWidth={0.8} fill="none" />
      ))}
      {Array.from({ length: D - 1 }, (_, i) => (
        <polyline key={`b${i}`} points={poli([0, i + 1, 0], [W, i + 1, 0])} stroke={P.border} strokeWidth={0.8} fill="none" />
      ))}
      {/* arka duvarlar */}
      <polygon points={poli([0, 0, 0], [0, D, 0], [0, D, H], [0, 0, H])} fill={P.acilanAlan} />
      <polygon points={poli([0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H])} fill={P.acilanAlan} />
      <polygon points={poli([0, 0, 0], [W, 0, 0], [W, 0, H], [0, 0, H])} fill="#000" opacity={0.08} />
      {/* pencereler */}
      {[1.2, 3.8, 6.4].map((px) => (
        <polygon key={px} className="ofis-davet__pencere" points={poli([px, 0, 1.0], [px + 1.6, 0, 1.0], [px + 1.6, 0, 2.15], [px, 0, 2.15])} fill={P.primary} opacity={0.55} />
      ))}
      {/* sol duvarda proje panosu */}
      <polygon points={poli([0, 1.4, 0.95], [0, 3.6, 0.95], [0, 3.6, 2.05], [0, 1.4, 2.05])} fill={P.surface} />
      {[0, 1, 2].map((i) => (
        <polygon
          key={i}
          points={poli([0, 1.6 + i * 0.68, 1.15], [0, 2.1 + i * 0.68, 1.15], [0, 2.1 + i * 0.68, 1.85], [0, 1.6 + i * 0.68, 1.85])}
          fill={i === 1 ? P.accent : P.border}
        />
      ))}
      {/* eşyalar: arkadan öne (x + y küçükten büyüğe) */}
      <Bitki x={0.3} y={0.3} />
      <Masa x={2} y={1} giysi={P.accent} gecikme={0} />
      <Masa x={5} y={1} giysi={P.primary} gecikme={0.8} />
      <Kutu x={0.4} y={4.6} w={0.9} d={2} h={0.5} renk={P.accentDark} />
      <Masa x={2} y={4} giysi={P.completed} gecikme={1.6} />
      <Masa x={5} y={4} giysi={P.danger} gecikme={0.4} />
      <Bitki x={8.2} y={6.2} />
      {/* tamamlanan görev baloncuğu */}
      <g className="ofis-davet__balon">
        <rect x={bx - 15} y={by - 30} width={30} height={22} rx={11} fill={P.surface} />
        <path d={`M${bx - 4},${by - 8.5} l4,6 l4,-6 z`} fill={P.surface} />
        <path d={`M${bx - 6},${by - 19} l4,4 l8,-8`} fill="none" stroke={P.completed} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
