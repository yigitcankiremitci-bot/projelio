import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { TURKIYE_ILLERI, ilSayimi, type Party } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { TURKIYE_IL_YOLLARI, TURKIYE_VIEWBOX } from "../../lib/harita/turkiyeIlYollari";
import { listeCercevesi, listeSatiri } from "../../lib/listeStili";
import Modal from "../Modal";

/**
 * Müşteriler > Haritada göster: il il müşteri sayısı (Türkiye).
 *
 * Biçim: tek renk tonlu yoğunluk haritası (sequential) — iş "nerede kaç
 * müşteri var", yani büyüklük. Renk temanın vurgu renginden, yüzeyle
 * karıştırılarak üretilir (color-mix): koyu temada koyu yüzeyden açılır,
 * ayrıca ikinci bir palet tutulmaz. Müşterisi olmayan il nötr yüzey rengi;
 * sıfırı en açık tonla göstermek "az var" sanılırdı.
 *
 * Sınıflar sabit eşikli (1 · 2–4 · 5–9 · 10–24 · 25+): müşteri dağılımı
 * çarpık (İstanbul yüzlerce, çoğu il bir-iki); doğrusal ölçek İstanbul
 * dışındaki her ili aynı açık tona boğardı.
 *
 * Erişilebilirlik: renk tek başına bilgi taşımaz — müşterisi olan her il
 * sayısıyla etiketli, üzerine gelince il adı, yanda sayı tablosu.
 * Şehri boş ya da tanınmayan kartlar ayrıca sayılır, kaybolmaz.
 *
 * Şimdilik yalnızca Türkiye (kullanıcı isteği, 2026-10-20).
 */

const ESIKLER = [1, 2, 5, 10, 25] as const;
// Basamaklar eşit aralıklı değil: düşük sınıflar koyu temada "müşteri yok"
// zeminine yapışıyordu (önizlemede görüldü), alt uç yukarı çekildi.
const TON = [28, 48, 66, 84, 100] as const;
/**
 * İl üzerindeki sayının boyu (SVG birimi; çizim alanı ~1000 birim geniş).
 * Müşterisi olan HER ilin sayısı yazılır (kullanıcı isteği, 2026-10-20 —
 * önce yalnızca en kalabalık 6 il yazılıyordu, 1-2 müşterili iller
 * üzerine gelmeden okunmuyordu); kalabalık iller biraz daha iri.
 */
const ETIKET_BOYU = 17;
const IRI_ETIKET_BOYU = 21;

function sinif(n: number): number {
  let k = -1;
  for (let i = 0; i < ESIKLER.length; i++) if (n >= ESIKLER[i]) k = i;
  return k;
}

function sinifEtiketi(i: number): string {
  const alt = ESIKLER[i];
  const ust = ESIKLER[i + 1];
  if (ust === undefined) return `${alt}+`;
  return ust - 1 === alt ? String(alt) : `${alt}–${ust - 1}`;
}

export default function MusteriHaritasi({ musteriler, onKapat }: { musteriler: Party[]; onKapat: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [uzerinde, setUzerinde] = useState<{ plaka: number; x: number; y: number } | null>(null);
  const [secili, setSecili] = useState<number | null>(null);
  const kap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { il: sayim, tanimsiz } = useMemo(() => ilSayimi(musteriler, (p) => p.address?.city), [musteriler]);
  const sirali = useMemo(
    () =>
      Array.from(sayim.entries())
        .map(([plaka, n]) => ({ plaka, ad: TURKIYE_ILLERI[plaka - 1].ad, n }))
        .sort((a, b) => b.n - a.n || a.ad.localeCompare(b.ad, "tr")),
    [sayim]
  );
  const ilSayisi = sirali.length;
  const haritada = musteriler.length - tanimsiz;

  const dolgu = (n: number) => {
    const k = sinif(n);
    if (k < 0) return c.background;
    return `color-mix(in oklab, ${c.accent} ${TON[k]}%, ${c.surface})`;
  };

  // En çok müşterili illerin sayısı il üzerine yazılır: yolun kutusunun ortası.
  const [etiketler, setEtiketler] = useState<{ plaka: number; x: number; y: number; n: number }[]>([]);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const l: { plaka: number; x: number; y: number; n: number }[] = [];
    for (const s of sirali) {
      const yol = svg.querySelector<SVGPathElement>(`path[data-plaka="${s.plaka}"]`);
      if (!yol) continue;
      const b = yol.getBBox();
      l.push({ plaka: s.plaka, x: b.x + b.width / 2, y: b.y + b.height / 2, n: s.n });
    }
    setEtiketler(l);
  }, [sirali]);

  const seciliMusteriler = useMemo(
    () =>
      secili === null
        ? []
        : musteriler
            .filter((p) => ilSayimi([p], (x) => x.address?.city).il.has(secili))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, "tr")),
    [secili, musteriler]
  );

  const ipucuIli = uzerinde ? TURKIYE_ILLERI[uzerinde.plaka - 1] : undefined;

  return (
    <Modal title={t("Müşteriler haritada")} onClose={onKapat} maxWidth={1080} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: c.textSecondary }}>
          <span>
            <strong style={{ color: c.textPrimary }}>{haritada}</strong> {t("müşteri")} ·{" "}
            <strong style={{ color: c.textPrimary }}>{ilSayisi}</strong> {t("il")}
          </span>
          {tanimsiz > 0 && <span>{t("{n} kartta il belirtilmemiş ya da tanınmadı", { n: tanimsiz })}</span>}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div ref={kap} style={{ position: "relative", flex: "3 1 520px", minWidth: 0 }}>
            <svg
              ref={svgRef}
              viewBox={TURKIYE_VIEWBOX}
              role="img"
              aria-label={t("İl il müşteri sayısını gösteren Türkiye haritası")}
              style={{ width: "100%", height: "auto", display: "block" }}
              onMouseLeave={() => setUzerinde(null)}
            >
              {TURKIYE_IL_YOLLARI.map(([plaka, d]) => {
                const n = sayim.get(plaka) ?? 0;
                const vurgulu = uzerinde?.plaka === plaka || secili === plaka;
                return (
                  <path
                    key={plaka}
                    data-plaka={plaka}
                    d={d}
                    fill={dolgu(n)}
                    // İller arasında yüzey renginde ince ayraç; üzerine gelinen il koyu çerçeveli.
                    stroke={vurgulu ? c.textPrimary : c.surface}
                    strokeWidth={vurgulu ? 1.6 : 0.8}
                    strokeLinejoin="round"
                    style={{ cursor: n > 0 ? "pointer" : "default", transition: "fill 120ms" }}
                    onMouseMove={(e) => {
                      const r = kap.current?.getBoundingClientRect();
                      if (r) setUzerinde({ plaka, x: e.clientX - r.left, y: e.clientY - r.top });
                    }}
                    onClick={() => n > 0 && setSecili(secili === plaka ? null : plaka)}
                  >
                    <title>{`${TURKIYE_ILLERI[plaka - 1].ad}: ${n}`}</title>
                  </path>
                );
              })}
              {etiketler.map((e) => (
                <text
                  key={e.plaka}
                  x={e.x}
                  y={e.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  // Yazı her zaman metin renginde, yüzey renginde haleyle: tonun
                  // açık ya da koyu olmasından bağımsız okunur (seriden renk almaz).
                  stroke={c.surface}
                  strokeWidth={4}
                  paintOrder="stroke"
                  style={{ fontSize: e.n >= 10 ? IRI_ETIKET_BOYU : ETIKET_BOYU, fontWeight: 700, fill: c.textPrimary, pointerEvents: "none" }}
                >
                  {e.n}
                </text>
              ))}
            </svg>
            {ipucuIli && uzerinde && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(uzerinde.x + 12, (kap.current?.clientWidth ?? 0) - 150),
                  top: uzerinde.y + 12,
                  pointerEvents: "none",
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: c.textPrimary,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  whiteSpace: "nowrap",
                }}
              >
                <div style={{ fontWeight: 600 }}>{ipucuIli.ad}</div>
                <div style={{ color: c.textSecondary }}>
                  {t("{n} müşteri", { n: sayim.get(ipucuIli.plaka) ?? 0 })}
                </div>
              </div>
            )}

            {/* Açıklama: sınıflar ve "müşteri yok". */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px", marginTop: 8, fontSize: 12, color: c.textSecondary }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 14, height: 10, borderRadius: 2, background: c.background, border: `1px solid ${c.border}` }} />
                {t("Müşteri yok")}
              </span>
              {ESIKLER.map((_, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 14, height: 10, borderRadius: 2, background: dolgu(ESIKLER[i]) }} />
                  {sinifEtiketi(i)}
                </span>
              ))}
            </div>
          </div>

          {/* Tablo görünümü: rengi ayırt edemeyen ya da sayıyı arayan için. */}
          <div style={{ flex: "1 1 220px", minWidth: 200, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary }}>{t("İl il müşteri")}</span>
            {sirali.length === 0 ? (
              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {t("Kartlarda il bilgisi yok. Müşteri kartının adresine şehir yazıldığında burada görünür.")}
              </span>
            ) : (
              <div style={{ ...listeCercevesi(c), maxHeight: 360, overflowY: "auto" }}>
                {sirali.map((s, i) => (
                  <button
                    key={s.plaka}
                    onClick={() => setSecili(secili === s.plaka ? null : s.plaka)}
                    onMouseEnter={() => setUzerinde(null)}
                    style={{
                      ...listeSatiri(c, i),
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 10px",
                      border: "none",
                      borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
                      outline: secili === s.plaka ? `2px solid ${c.primary}` : "none",
                      outlineOffset: -2,
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: 13,
                      color: c.textPrimary,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: dolgu(s.n), flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>{s.ad}</span>
                    <span style={{ fontWeight: 600 }}>{s.n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {secili !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary }}>
              {t("{il}: {n} müşteri", { il: TURKIYE_ILLERI[secili - 1].ad, n: seciliMusteriler.length })}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {seciliMusteriler.map((p) => (
                <span
                  key={p.id}
                  style={{ fontSize: 12, padding: "3px 10px", borderRadius: 999, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary }}
                >
                  {p.displayName}
                  {p.address?.district && <span style={{ color: c.textSecondary }}> · {p.address.district}</span>}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
