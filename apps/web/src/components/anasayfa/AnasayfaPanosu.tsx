import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { PANO_BOYUTLARI, type PanoBoyut } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { pageGutter } from "../../lib/layout";
import { LONG_PRESS_DELAY, useSortableList } from "../../lib/useSortableList";
import type { AnasayfaPano } from "../../lib/useAnasayfaPano";
import { tourAnchor } from "../../lib/tour/types";
import { useT } from "../../lib/i18n";
import { IconChevronLeft, IconChevronRight, IconEdit, IconX } from "../icons";
import PanoOzellestir from "./PanoOzellestir";
import type { PanoKartTanimi } from "./ozetKartlari";

const BOYUT_HARFI: Record<PanoBoyut, string> = { kucuk: "S", orta: "M", genis: "L" };
const BOYUT_ADI: Record<PanoBoyut, string> = { kucuk: "Küçük", orta: "Orta", genis: "Geniş" }; // dil:anahtar

/** Sayfa başlığındaki "Özelleştir" düğmesi. */
export function OzellestirDugmesi({ acik, onClick }: { acik: boolean; onClick: () => void }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={acik}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        padding: "0 12px",
        borderRadius: 10,
        border: `1px solid ${acik ? c.accent : c.border}`,
        background: c.surface,
        color: c.textPrimary,
        fontSize: 14,
        whiteSpace: "nowrap",
      }}
    >
      <IconEdit size={14} color={c.textSecondary} />
      {acik ? t("Bitti") : t("Özelleştir")}
    </button>
  );
}

/** Karttaki küçük denetim düğmeleri için ortak görünüm. */
function denetimStili(c: ReturnType<typeof useThemeColors>, secili = false): CSSProperties {
  return {
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 6,
    border: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 600,
    background: secili ? c.accent : "transparent",
    color: secili ? c.surface : c.textSecondary,
  };
}

/**
 * Anasayfanın kendisi: kullanıcının dizdiği özet kartları.
 *
 * Taşıma her zaman açık (basılı tut, sürükle — uygulamadaki bütün tut-taşı
 * listeleriyle aynı his). Özelleştir modu yalnızca boyut, kaldırma ve raf
 * denetimlerini açar; kartlar bu modda bağlantı gibi davranmaz ki taşırken ya
 * da boyut seçerken yanlışlıkla sayfadan çıkılmasın.
 */
export default function AnasayfaPanosu({
  pano,
  katalog,
  duzenleme,
  onDuzenlemeBitti,
}: {
  pano: AnasayfaPano;
  katalog: PanoKartTanimi[];
  duzenleme: boolean;
  onDuzenlemeBitti: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const gutter = pageGutter(useIsDesktop());
  const izgaraRef = useRef<HTMLDivElement>(null);
  const tanimlar = new Map(katalog.map((k) => [k.id, k]));
  const gorunen = pano.kartlar.filter((k) => tanimlar.has(k.id));
  const siraAnahtari = gorunen.map((k) => k.id).join(",");

  const panoRef = useRef(pano);
  panoRef.current = pano;

  useSortableList(
    izgaraRef,
    {
      draggable: ".pano-hucre",
      // Pano container-type kullanıyor: içindeki position:fixed hayalet panoya
      // göre konumlanıp imleçten kopardı. Gövdeye eklenince imleci izliyor.
      fallbackOnBody: true,
      // Özelleştirirken niyet zaten taşımak: basılı tutma beklenmez.
      delay: duzenleme ? 0 : LONG_PRESS_DELAY,
      onEnd: (olay) => {
        if (olay.oldIndex === olay.newIndex) return;
        const el = izgaraRef.current;
        if (!el) return;
        panoRef.current.sirala(Array.from(el.children).map((n) => (n as HTMLElement).dataset.id!).filter(Boolean));
      },
    },
    [duzenleme, gorunen.length === 0]
  );

  // Klavyeyle ve kısa dokunuşla da taşınabilsin: sürükleme ikisine de kapalı.
  const kaydir = (id: string, yon: -1 | 1) => {
    const sira = siraAnahtari.split(",");
    const i = sira.indexOf(id);
    const j = i + yon;
    if (i < 0 || j < 0 || j >= sira.length) return;
    [sira[i], sira[j]] = [sira[j], sira[i]];
    pano.sirala(sira);
  };

  return (
    <div className="pano" style={{ padding: `0 ${gutter}px 110px` }}>
      {duzenleme && <PanoOzellestir pano={pano} katalog={katalog} onKapat={onDuzenlemeBitti} />}

      {gorunen.length === 0 ? (
        <div style={{ border: `1px dashed ${c.border}`, borderRadius: 14, padding: 32, textAlign: "center", color: c.textSecondary, fontSize: 15 }}>
          {t("Panon boş. Özelleştir'den istediğin kartları ekleyebilirsin.")}
        </div>
      ) : (
        <div ref={izgaraRef} className={`pano-izgara${duzenleme ? " pano-izgara--duzenleme" : ""}`} {...tourAnchor("dashboard-tabs")}>
          {gorunen.map((kart, sira) => {
            const tanim = tanimlar.get(kart.id)!;
            return (
              <div key={kart.id} data-id={kart.id} data-boyut={kart.boyut} className="pano-hucre" {...(tanim.turCapasi ? tourAnchor(tanim.turCapasi) : {})}>
                <Link
                  to={tanim.hedef}
                  draggable={false}
                  className="entity-card pano-kart"
                  onClick={(e) => {
                    if (duzenleme) e.preventDefault();
                  }}
                  style={{ background: c.surface, border: `1px solid ${c.border}`, paddingBottom: duzenleme ? 44 : 14 }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0, marginBottom: "auto", paddingBottom: 10 }}>
                    <tanim.Icon size={15} color={c.accentDark} />
                    <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {tanim.ad}
                    </span>
                  </span>
                  {tanim.ciz(kart.boyut)}
                </Link>

                {duzenleme && (
                  <div className="no-drag pano-denetim" style={{ background: c.background }}>
                    <span style={{ display: "flex" }}>
                      <button type="button" disabled={sira === 0} onClick={() => kaydir(kart.id, -1)} aria-label={t("Öne al")} title={t("Öne al")} style={denetimStili(c)}>
                        <IconChevronLeft size={13} color="currentColor" />
                      </button>
                      <button type="button" disabled={sira === gorunen.length - 1} onClick={() => kaydir(kart.id, 1)} aria-label={t("Arkaya al")} title={t("Arkaya al")} style={denetimStili(c)}>
                        <IconChevronRight size={13} color="currentColor" />
                      </button>
                    </span>
                    <span style={{ display: "flex" }}>
                      {PANO_BOYUTLARI.map((b) => (
                        <button key={b} type="button" onClick={() => pano.boyutAyarla(kart.id, b)} aria-pressed={kart.boyut === b} aria-label={t(BOYUT_ADI[b])} title={t(BOYUT_ADI[b])} style={denetimStili(c, kart.boyut === b)}>
                          {BOYUT_HARFI[b]}
                        </button>
                      ))}
                    </span>
                    <button type="button" onClick={() => pano.kaldir(kart.id)} aria-label={t("Panodan kaldır")} title={t("Panodan kaldır")} style={denetimStili(c)}>
                      <IconX size={13} color="currentColor" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Özelleştirme modunun aç/kapa durumu; adres değişince kapanır. */
export function useDuzenlemeModu(sifirlaAnahtari: unknown) {
  const [acik, setAcik] = useState(false);
  useEffect(() => setAcik(false), [sifirlaAnahtari]);
  return [acik, setAcik] as const;
}
