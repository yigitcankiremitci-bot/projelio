import { useMemo } from "react";
import type { ButceDonemNoktasi } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtDonem, fmtPara } from "./butceBicim";

interface Props {
  /** Tek para biriminin dönem noktaları, eskiden yeniye sıralı. */
  noktalar: ButceDonemNoktasi[];
  currency: string;
}

const YUKSEKLIK = 170;
const UST_BOSLUK = 14;
const ALT_BOSLUK = 24;

/**
 * Aylık gelir/gider çubukları + birikimli bakiye çizgisi.
 *
 * İKİ SORUYU BİRDEN CEVAPLAR ve bu yüzden tek grafikte duruyorlar:
 *   · çubuklar — "bu ay ne girdi, ne çıktı"
 *   · çizgi    — "biriken para hangi yöne gidiyor"
 * Ayrı grafiklere bölünse, iyi bir ayın birikimi nasıl çevirdiği (ya da iyi
 * görünen bir ayın hâlâ eksideki bakiyeyi kurtarmadığı) görünmezdi.
 *
 * SVG, viewBox ile ölçekleniyor ama yazılar `vector-effect` yerine sabit
 * piksel: viewBox esnerken yazıların da esnemesi okunaksız yapıyordu
 * (bkz. BudgetTrendChart, orada kutu düzeni tam bu yüzden seçilmişti — burada
 * çizgi gerektiği için SVG şart).
 */
export default function NakitAkisGrafigi({ noktalar, currency }: Props) {
  const c = useThemeColors();
  const t = useT();

  const olcek = useMemo(() => {
    const enBuyuk = Math.max(1, ...noktalar.map((n) => Math.max(n.income, n.expense)));
    const birikimliler = noktalar.map((n) => n.birikimli);
    return {
      enBuyuk,
      birikimliMin: Math.min(0, ...birikimliler),
      birikimliMax: Math.max(0, ...birikimliler),
    };
  }, [noktalar]);

  if (noktalar.length === 0) {
    return (
      <div
        style={{
          border: `1px dashed ${c.border}`,
          borderRadius: 12,
          padding: 22,
          textAlign: "center",
          color: c.textSecondary,
          fontSize: 14,
        }}
      >
        {t("Grafik için henüz yeterli hareket yok.")}
      </div>
    );
  }

  const genislik = Math.max(280, noktalar.length * 52);
  const alanYuksekligi = YUKSEKLIK - UST_BOSLUK - ALT_BOSLUK;
  const sutunGenisligi = genislik / noktalar.length;
  const cubukGenisligi = Math.min(11, sutunGenisligi / 3.2);

  const yCubuk = (deger: number) => UST_BOSLUK + alanYuksekligi - (deger / olcek.enBuyuk) * alanYuksekligi;

  // Birikimli çizgi kendi ölçeğinde: çubuklarla aynı eksende olsaydı, aylık
  // hareketleri küçük ama birikimi büyük bir defterde çizgi tepede düz bir
  // şerit hâline gelir ve yönü okunmazdı.
  const birikimliAralik = Math.max(1, olcek.birikimliMax - olcek.birikimliMin);
  const yBirikimli = (deger: number) =>
    UST_BOSLUK + alanYuksekligi - ((deger - olcek.birikimliMin) / birikimliAralik) * alanYuksekligi;

  const cizgi = noktalar
    .map((n, i) => `${i === 0 ? "M" : "L"} ${(i + 0.5) * sutunGenisligi} ${yBirikimli(n.birikimli)}`)
    .join(" ");

  const son = noktalar[noktalar.length - 1];

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>
          {t("Nakit akışı")} · {currency}
        </span>
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t("Dönem sonu")}:{" "}
          <strong style={{ color: son.birikimli >= 0 ? c.success : c.danger }}>{fmtPara(son.birikimli, currency)}</strong>
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg
          viewBox={`0 0 ${genislik} ${YUKSEKLIK}`}
          preserveAspectRatio="none"
          style={{ width: "100%", minWidth: genislik, height: YUKSEKLIK, display: "block" }}
          role="img"
          aria-label={t("Nakit akışı grafiği")}
        >
          {/* Taban çizgisi */}
          <line
            x1={0}
            y1={UST_BOSLUK + alanYuksekligi}
            x2={genislik}
            y2={UST_BOSLUK + alanYuksekligi}
            stroke={c.border}
            strokeWidth={1}
          />

          {noktalar.map((n, i) => {
            const orta = (i + 0.5) * sutunGenisligi;
            const taban = UST_BOSLUK + alanYuksekligi;
            return (
              <g key={`${n.currency}-${n.donem}`}>
                <rect
                  x={orta - cubukGenisligi - 1}
                  y={yCubuk(n.income)}
                  width={cubukGenisligi}
                  height={Math.max(0, taban - yCubuk(n.income))}
                  fill={c.success}
                  rx={2}
                >
                  <title>{`${fmtDonem(n.donem)} · ${fmtPara(n.income, n.currency)}`}</title>
                </rect>
                <rect
                  x={orta + 1}
                  y={yCubuk(n.expense)}
                  width={cubukGenisligi}
                  height={Math.max(0, taban - yCubuk(n.expense))}
                  fill={c.danger}
                  rx={2}
                >
                  <title>{`${fmtDonem(n.donem)} · ${fmtPara(n.expense, n.currency)}`}</title>
                </rect>
              </g>
            );
          })}

          <path d={cizgi} fill="none" stroke={c.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {noktalar.map((n, i) => (
            <circle
              key={`nokta-${n.donem}`}
              cx={(i + 0.5) * sutunGenisligi}
              cy={yBirikimli(n.birikimli)}
              r={2.5}
              fill={c.accent}
            >
              <title>{`${fmtDonem(n.donem)} · ${fmtPara(n.birikimli, n.currency)}`}</title>
            </circle>
          ))}
        </svg>

        {/* Ay etiketleri SVG'nin DIŞINDA: preserveAspectRatio="none" ile
            ölçeklenen bir svg içindeki yazı yatayda gerilip okunaksız oluyor. */}
        <div style={{ display: "flex", minWidth: genislik }}>
          {noktalar.map((n) => (
            <span
              key={`etiket-${n.donem}`}
              style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: c.textSecondary, minWidth: 0 }}
            >
              {fmtDonem(n.donem)}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
        <Gosterge renk={c.success} etiket={t("Gelir")} />
        <Gosterge renk={c.danger} etiket={t("Gider")} />
        <Gosterge renk={c.accent} etiket={t("Birikimli bakiye")} />
      </div>
    </div>
  );
}

function Gosterge({ renk, etiket }: { renk: string; etiket: string }) {
  const c = useThemeColors();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: c.textSecondary }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: renk }} />
      {etiket}
    </span>
  );
}
