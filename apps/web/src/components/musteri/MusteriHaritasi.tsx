import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TURKIYE_ILLERI, ilAnahtari, ilBul, ilSayimi, type Party } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { TURKIYE_IL_YOLLARI, TURKIYE_VIEWBOX } from "../../lib/harita/turkiyeIlYollari";
import { listeCercevesi, listeSatiri, sekmeStili } from "../../lib/listeStili";
import Modal from "../Modal";

/**
 * Müşteriler > Haritada göster: il il, bir ile çift tıklayınca ilçe ilçe
 * müşteri sayısı (Türkiye).
 *
 * Biçim: tek renk tonlu yoğunluk haritası (sequential) — iş "nerede kaç
 * müşteri var", yani büyüklük. Renk temanın vurgu renginden, yüzeyle
 * karıştırılarak üretilir (color-mix): koyu temada koyu yüzeyden açılır,
 * ayrıca ikinci bir palet tutulmaz. Müşterisi olmayan bölge nötr zemin
 * rengi; sıfırı en açık tonla göstermek "az var" sanılırdı.
 *
 * Sınıflar sabit eşikli (1 · 2–4 · 5–9 · 10–24 · 25+): müşteri dağılımı
 * çarpık (İstanbul yüzlerce, çoğu il bir-iki); doğrusal ölçek İstanbul
 * dışındaki her ili aynı açık tona boğardı. İlçe haritası aynı eşikleri
 * kullanır — iki görünümde aynı ton aynı sayı demek.
 *
 * Etkileşim (kullanıcı isteği, 2026-10-20): tek tık bölgeyi seçer ve sağdaki
 * listeyi o bölgenin müşterilerine daraltır; ile çift tık ilçe haritasını
 * açar; listedeki müşteriye tıklamak kartını pencerede açar (onMusteriAc).
 * İlçe verisi il başına ayrı parça (lib/harita/ilceler/<plaka>.json),
 * yalnızca açılan il yüklenir.
 *
 * Erişilebilirlik: renk tek başına bilgi taşımaz — müşterisi olan her bölge
 * sayısıyla etiketli, üzerine gelince adı, yanda liste. Şehri ya da ilçesi
 * boş / tanınmayan kartlar ayrıca sayılır, kaybolmaz.
 *
 * Şimdilik yalnızca Türkiye.
 */

const ESIKLER = [1, 2, 5, 10, 25] as const;
// Basamaklar eşit aralıklı değil: düşük sınıflar koyu temada "müşteri yok"
// zeminine yapışıyordu (önizlemede görüldü), alt uç yukarı çekildi.
const TON = [28, 48, 66, 84, 100] as const;
/**
 * Bölge üzerindeki sayının boyu (SVG birimi; il haritası ~1000 birim geniş).
 * Müşterisi olan HER bölgenin sayısı yazılır (önce yalnızca en kalabalık 6
 * il yazılıyordu, 1-2 müşterili iller okunmuyordu); kalabalıklar biraz iri.
 */
const ETIKET_BOYU = 17;
const IRI_ETIKET_BOYU = 21;

// İl başına ilçe dosyası; Vite her birini ayrı, içerik özetli parça yapar.
const ILCE_DOSYALARI = import.meta.glob<{ plaka: number; ilceler: { ad: string; d: string }[] }>(
  "../../lib/harita/ilceler/*.json",
  { import: "default" }
);

function ilceDosyasi(plaka: number) {
  const yukle = ILCE_DOSYALARI[`../../lib/harita/ilceler/${plaka}.json`];
  return yukle ? yukle() : Promise.reject(new Error("ilçe verisi yok"));
}

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

/** "KADIKÖY" → "Kadıköy" (ilçe verisi büyük harfle geliyor). */
function baslikHarfi(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .split(/(\s+|-)/)
    .map((w) => (w.trim() && w !== "-" ? w.charAt(0).toLocaleUpperCase("tr") + w.slice(1) : w))
    .join("");
}

/**
 * Kartın ilçesi: adresin ilçe alanı, boşsa şehir alanındaki parçalar
 * ("İstanbul/Kadıköy"). Tanınmazsa undefined.
 */
function ilceBul(p: Party, ilceAnahtarlari: Map<string, string>): string | undefined {
  const adaylar = [p.address?.district, ...String(p.address?.city ?? "").split(/[\/,\-–()]+/)];
  for (const a of adaylar) {
    const ad = ilceAnahtarlari.get(ilAnahtari(a));
    if (ad) return ad;
  }
  return undefined;
}

type Gorunum = { tur: "turkiye" } | { tur: "il"; plaka: number };
type Ilce = { ad: string; d: string };

export default function MusteriHaritasi({
  musteriler,
  onKapat,
  onMusteriAc,
}: {
  musteriler: Party[];
  onKapat: () => void;
  /** Listedeki müşteriye tıklanınca kartı açar (pencere CustomersPanel'de). */
  onMusteriAc: (p: Party) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [gorunum, setGorunum] = useState<Gorunum>({ tur: "turkiye" });
  /** Türkiye görünümünde seçili il; il görünümünde seçili ilçe (adı). */
  const [seciliIl, setSeciliIl] = useState<number | null>(null);
  const [seciliIlce, setSeciliIlce] = useState<string | null>(null);
  const [uzerinde, setUzerinde] = useState<{ ad: string; n: number; x: number; y: number } | null>(null);
  const [ilceler, setIlceler] = useState<Ilce[] | null>(null);
  const [ilceHata, setIlceHata] = useState("");
  const kap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ---------------------------------------------------------------- Sayımlar
  const ilOf = useMemo(() => {
    const m = new Map<string, number | undefined>();
    for (const p of musteriler) m.set(p.id, ilBul(p.address?.city)?.plaka);
    return m;
  }, [musteriler]);
  const { il: ilSayim, tanimsiz } = useMemo(() => ilSayimi(musteriler, (p) => p.address?.city), [musteriler]);
  const iller = useMemo(
    () =>
      Array.from(ilSayim.entries())
        .map(([plaka, n]) => ({ plaka, ad: TURKIYE_ILLERI[plaka - 1].ad, n }))
        .sort((a, b) => b.n - a.n || a.ad.localeCompare(b.ad, "tr")),
    [ilSayim]
  );

  const acikIl = gorunum.tur === "il" ? gorunum.plaka : null;
  useEffect(() => {
    setIlceler(null);
    setIlceHata("");
    setSeciliIlce(null);
    if (acikIl === null) return;
    let iptal = false;
    ilceDosyasi(acikIl)
      .then((v) => !iptal && setIlceler(v.ilceler.map((x) => ({ ad: baslikHarfi(x.ad), d: x.d }))))
      .catch(() => !iptal && setIlceHata(t("Bu ilin ilçe haritası yüklenemedi.")));
    return () => {
      iptal = true;
    };
  }, [acikIl]);

  const ildeki = useMemo(
    () => (acikIl === null ? [] : musteriler.filter((p) => ilOf.get(p.id) === acikIl)),
    [acikIl, musteriler, ilOf]
  );
  const ilceAnahtarlari = useMemo(() => new Map((ilceler ?? []).map((x) => [ilAnahtari(x.ad), x.ad])), [ilceler]);
  const ilceOf = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const p of ildeki) m.set(p.id, ilceBul(p, ilceAnahtarlari));
    return m;
  }, [ildeki, ilceAnahtarlari]);
  const ilceSayim = useMemo(() => {
    const m = new Map<string, number>();
    let bos = 0;
    for (const p of ildeki) {
      const ad = ilceOf.get(p.id);
      if (ad) m.set(ad, (m.get(ad) ?? 0) + 1);
      else bos += 1;
    }
    return { m, bos };
  }, [ildeki, ilceOf]);

  // ---------------------------------------------------------------- Çizim
  const dolgu = (n: number) => {
    const k = sinif(n);
    if (k < 0) return c.background;
    return `color-mix(in oklab, ${c.accent} ${TON[k]}%, ${c.surface})`;
  };

  // Bölgelerin sayısı bölgenin üzerine yazılır (yolun kutusunun ortası). İlçe
  // haritasında çizim alanı da yolların kutusundan ölçülür.
  const [etiketler, setEtiketler] = useState<{ anahtar: string; x: number; y: number; n: number }[]>([]);
  const [ilceViewBox, setIlceViewBox] = useState<string | null>(null);
  const [ilceBirim, setIlceBirim] = useState(1);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const l: { anahtar: string; x: number; y: number; n: number }[] = [];
    if (gorunum.tur === "turkiye") {
      for (const s of iller) {
        const yol = svg.querySelector<SVGPathElement>(`path[data-bolge="${s.plaka}"]`);
        if (!yol) continue;
        const b = yol.getBBox();
        l.push({ anahtar: String(s.plaka), x: b.x + b.width / 2, y: b.y + b.height / 2, n: s.n });
      }
      setIlceViewBox(null);
    } else if (ilceler) {
      const g = svg.querySelector<SVGGElement>("g[data-ilceler]");
      if (g) {
        const b = g.getBBox();
        const pay = Math.max(b.width, b.height) * 0.03;
        setIlceViewBox(`${b.x - pay} ${b.y - pay} ${b.width + 2 * pay} ${b.height + 2 * pay}`);
        // Etiket ve çizgi kalınlığı çizim alanına göre: il haritası ~1000
        // birim geniş, ilçe haritaları kendi ölçeğinde (kimi 150, kimi 900).
        setIlceBirim(Math.max(b.width, b.height) / 1000);
      }
      for (const x of ilceler) {
        const n = ilceSayim.m.get(x.ad) ?? 0;
        if (n === 0) continue;
        const yol = svg.querySelector<SVGPathElement>(`path[data-bolge="${CSS.escape(x.ad)}"]`);
        if (!yol) continue;
        const b = yol.getBBox();
        l.push({ anahtar: x.ad, x: b.x + b.width / 2, y: b.y + b.height / 2, n });
      }
    }
    setEtiketler(l);
  }, [gorunum, iller, ilceler, ilceSayim]);

  // ---------------------------------------------------------------- Liste
  const listedekiler = useMemo(() => {
    let l: Party[];
    if (gorunum.tur === "il") l = seciliIlce ? ildeki.filter((p) => ilceOf.get(p.id) === seciliIlce) : ildeki;
    else l = seciliIl === null ? [] : musteriler.filter((p) => ilOf.get(p.id) === seciliIl);
    return l.slice().sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
  }, [gorunum, seciliIl, seciliIlce, ildeki, ilceOf, musteriler, ilOf]);

  const ilAc = (plaka: number) => {
    setUzerinde(null);
    setSeciliIl(plaka);
    setGorunum({ tur: "il", plaka });
  };

  const ipucu = (ad: string, n: number) => (e: React.MouseEvent) => {
    const r = kap.current?.getBoundingClientRect();
    if (r) setUzerinde({ ad, n, x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const turkiyeMi = gorunum.tur === "turkiye";
  const birim = turkiyeMi ? 1 : ilceBirim;
  const baslikIl = acikIl !== null ? TURKIYE_ILLERI[acikIl - 1].ad : undefined;

  const listeBasligi = turkiyeMi
    ? seciliIl === null
      ? t("İl il müşteri")
      : t("{il}: {n} müşteri", { il: TURKIYE_ILLERI[seciliIl - 1].ad, n: listedekiler.length })
    : seciliIlce
      ? t("{il}: {n} müşteri", { il: `${seciliIlce} / ${baslikIl}`, n: listedekiler.length })
      : t("{il}: {n} müşteri", { il: baslikIl, n: listedekiler.length });

  return (
    <Modal title={t("Müşteriler haritada")} onClose={onKapat} maxWidth={1180} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 16px", fontSize: 13, color: c.textSecondary }}>
          {!turkiyeMi && (
            <button onClick={() => setGorunum({ tur: "turkiye" })} style={sekmeStili(c, false)}>
              {t("← Türkiye")}
            </button>
          )}
          {turkiyeMi ? (
            <>
              <span>
                <strong style={{ color: c.textPrimary }}>{musteriler.length - tanimsiz}</strong> {t("müşteri")} ·{" "}
                <strong style={{ color: c.textPrimary }}>{iller.length}</strong> {t("il")}
              </span>
              {tanimsiz > 0 && <span>{t("{n} kartta il belirtilmemiş ya da tanınmadı", { n: tanimsiz })}</span>}
              <span>{t("Bir ile çift tıklayınca ilçeleri açılır.")}</span>
            </>
          ) : (
            <>
              <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{baslikIl}</span>
              <span>
                <strong style={{ color: c.textPrimary }}>{ildeki.length}</strong> {t("müşteri")}
              </span>
              {ilceler && ilceSayim.bos > 0 && <span>{t("{n} kartta ilçe belirtilmemiş ya da tanınmadı", { n: ilceSayim.bos })}</span>}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div ref={kap} style={{ position: "relative", flex: "3 1 560px", minWidth: 0 }}>
            {!turkiyeMi && !ilceler && (
              <p style={{ fontSize: 13, color: ilceHata ? c.danger : c.textSecondary, margin: "40px 0", textAlign: "center" }}>
                {ilceHata || t("İlçe haritası yükleniyor…")}
              </p>
            )}
            <svg
              key={turkiyeMi ? "turkiye" : `il-${acikIl}`}
              ref={svgRef}
              viewBox={turkiyeMi ? TURKIYE_VIEWBOX : ilceViewBox ?? "0 0 1000 1000"}
              role="img"
              aria-label={
                turkiyeMi
                  ? t("İl il müşteri sayısını gösteren Türkiye haritası")
                  : t("{il} ilinin ilçe ilçe müşteri sayısını gösteren harita", { il: baslikIl })
              }
              style={{
                width: "100%",
                height: "auto",
                maxHeight: "62vh",
                display: !turkiyeMi && !ilceler ? "none" : "block",
                // Ölçülmeden önceki ilk karede yanlış çizim alanı görünmesin.
                visibility: !turkiyeMi && !ilceViewBox ? "hidden" : "visible",
              }}
              onMouseLeave={() => setUzerinde(null)}
            >
              {turkiyeMi ? (
                TURKIYE_IL_YOLLARI.map(([plaka, d]) => {
                  const n = ilSayim.get(plaka) ?? 0;
                  const ad = TURKIYE_ILLERI[plaka - 1].ad;
                  const vurgulu = uzerinde?.ad === ad || seciliIl === plaka;
                  return (
                    <path
                      key={plaka}
                      data-bolge={plaka}
                      d={d}
                      fill={dolgu(n)}
                      // Bölgeler arasında yüzey renginde ince ayraç; seçili/üzerindeki koyu çerçeveli.
                      stroke={vurgulu ? c.textPrimary : c.surface}
                      strokeWidth={vurgulu ? 1.6 : 0.8}
                      strokeLinejoin="round"
                      style={{ cursor: "pointer", transition: "fill 120ms" }}
                      onMouseMove={ipucu(ad, n)}
                      onClick={() => setSeciliIl(seciliIl === plaka ? null : plaka)}
                      onDoubleClick={() => ilAc(plaka)}
                    />
                  );
                })
              ) : (
                <g data-ilceler="">
                  {(ilceler ?? []).map((x) => {
                    const n = ilceSayim.m.get(x.ad) ?? 0;
                    const vurgulu = uzerinde?.ad === x.ad || seciliIlce === x.ad;
                    return (
                      <path
                        key={x.ad}
                        data-bolge={x.ad}
                        d={x.d}
                        fill={dolgu(n)}
                        stroke={vurgulu ? c.textPrimary : c.surface}
                        strokeWidth={(vurgulu ? 1.6 : 0.8) * birim}
                        strokeLinejoin="round"
                        style={{ cursor: "pointer", transition: "fill 120ms" }}
                        onMouseMove={ipucu(x.ad, n)}
                        onClick={() => setSeciliIlce(seciliIlce === x.ad ? null : x.ad)}
                      />
                    );
                  })}
                </g>
              )}
              {etiketler.map((e) => (
                <text
                  key={e.anahtar}
                  x={e.x}
                  y={e.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  // Yazı her zaman metin renginde, yüzey renginde haleyle: tonun
                  // açık ya da koyu olmasından bağımsız okunur (seriden renk almaz).
                  stroke={c.surface}
                  strokeWidth={4 * birim}
                  paintOrder="stroke"
                  style={{
                    fontSize: (e.n >= 10 ? IRI_ETIKET_BOYU : ETIKET_BOYU) * birim * (turkiyeMi ? 1 : 1.4),
                    fontWeight: 700,
                    fill: c.textPrimary,
                    pointerEvents: "none",
                  }}
                >
                  {e.n}
                </text>
              ))}
            </svg>
            {uzerinde && (
              <div
                style={{
                  position: "absolute",
                  left: Math.min(uzerinde.x + 12, (kap.current?.clientWidth ?? 0) - 160),
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
                <div style={{ fontWeight: 600 }}>{uzerinde.ad}</div>
                <div style={{ color: c.textSecondary }}>{t("{n} müşteri", { n: uzerinde.n })}</div>
                {turkiyeMi && <div style={{ color: c.textSecondary, fontSize: 11 }}>{t("Çift tıkla: ilçeler")}</div>}
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

          {/* Yan liste: seçim yoksa il tablosu, seçimde o bölgenin müşterileri. */}
          <div style={{ flex: "1 1 260px", minWidth: 240, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: c.textPrimary, flex: 1, minWidth: 0 }}>{listeBasligi}</span>
              {turkiyeMi && seciliIl !== null && (
                <button onClick={() => ilAc(seciliIl)} style={{ ...sekmeStili(c, false), fontSize: 12, padding: "3px 10px" }}>
                  {t("İlçeler")}
                </button>
              )}
              {((turkiyeMi && seciliIl !== null) || (!turkiyeMi && seciliIlce)) && (
                <button
                  onClick={() => (turkiyeMi ? setSeciliIl(null) : setSeciliIlce(null))}
                  style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
                >
                  {turkiyeMi ? t("Tüm iller") : t("Tüm ilçeler")}
                </button>
              )}
            </div>

            {turkiyeMi && seciliIl === null ? (
              iller.length === 0 ? (
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {t("Kartlarda il bilgisi yok. Müşteri kartının adresine şehir yazıldığında burada görünür.")}
                </span>
              ) : (
                <div style={{ ...listeCercevesi(c), maxHeight: "58vh", overflowY: "auto" }}>
                  {iller.map((s, i) => (
                    <button key={s.plaka} onClick={() => setSeciliIl(s.plaka)} onDoubleClick={() => ilAc(s.plaka)} style={satirDugmesi(c, i)}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: dolgu(s.n), flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>{s.ad}</span>
                      <span style={{ fontWeight: 600 }}>{s.n}</span>
                    </button>
                  ))}
                </div>
              )
            ) : listedekiler.length === 0 ? (
              <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Bu bölgede müşteri yok.")}</span>
            ) : (
              <div style={{ ...listeCercevesi(c), maxHeight: "58vh", overflowY: "auto" }}>
                {listedekiler.map((p, i) => {
                  const ilce = !turkiyeMi ? ilceOf.get(p.id) : p.address?.district;
                  return (
                    <button key={p.id} onClick={() => onMusteriAc(p)} title={t("Kartı aç")} style={satirDugmesi(c, i)}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.displayName}</span>
                        {(ilce || p.phone) && (
                          <span style={{ display: "block", fontSize: 11, color: c.textSecondary }}>
                            {[ilce, p.phone].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <span aria-hidden style={{ color: c.textSecondary }}>›</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function satirDugmesi(c: ReturnType<typeof useThemeColors>, i: number): React.CSSProperties {
  return {
    ...listeSatiri(c, i),
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 10px",
    border: "none",
    borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
    cursor: "pointer",
    textAlign: "left",
    fontSize: 13,
    color: c.textPrimary,
    width: "100%",
  };
}
