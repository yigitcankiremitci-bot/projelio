import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { IconCheck, IconX } from "../icons";
import type { PanoKartTanimi } from "./ozetKartlari";

type Grup = PanoKartTanimi["grup"];
const GRUPLAR: { key: Grup; ad: string }[] = [
  { key: "temel", ad: "Özetler" }, // dil:anahtar
  { key: "arac", ad: "Araçlar" }, // dil:anahtar
  { key: "modul", ad: "Modüller" }, // dil:anahtar
  { key: "proje", ad: "Projeler" }, // dil:anahtar
];

/**
 * Boşluktaki + ile açılan seçici: panoda olmayanlar büyük kutucuklar hâlinde,
 * tek dokunuşla eklenir ve kapanır.
 *
 * Gövdeye taşınıyor: pano container-type kullandığı için içindeki
 * position:fixed ekrana değil panoya göre konumlanırdı.
 */
export default function PanoEkle({
  secenekler,
  onSec,
  onSifirla,
  onKapat,
}: {
  secenekler: PanoKartTanimi[];
  onSec: (tanim: PanoKartTanimi) => void;
  onSifirla: () => void;
  onKapat: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const gruplar = GRUPLAR.filter((g) => secenekler.some((s) => s.grup === g.key));
  const [secili, setSecili] = useState<Grup | null>(null);
  const [sifirlaOnay, setSifirlaOnay] = useState(false);
  const aktif = gruplar.find((g) => g.key === secili)?.key ?? gruplar[0]?.key;

  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onKapat();
    };
    window.addEventListener("keydown", dinle);
    return () => window.removeEventListener("keydown", dinle);
  }, [onKapat]);

  return createPortal(
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onKapat();
      }}
      className="pano-ekle-zemin"
    >
      <div role="dialog" aria-modal="true" aria-label={t("Panoya ekle")} className="pano-ekle" style={{ background: c.surface, border: `1px solid ${c.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ display: "flex", gap: 4, flex: 1, minWidth: 0, overflowX: "auto" }}>
            {gruplar.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setSecili(g.key)}
                aria-pressed={aktif === g.key}
                style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: aktif === g.key ? c.background : "transparent", color: aktif === g.key ? c.textPrimary : c.textSecondary, fontSize: 14, whiteSpace: "nowrap" }}
              >
                {t(g.ad)}
              </button>
            ))}
          </div>
          <button type="button" onClick={onKapat} aria-label={t("Kapat")} title={t("Kapat")} style={{ width: 32, height: 32, padding: 0, border: "none", background: "transparent", color: c.textSecondary, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <IconX size={17} color="currentColor" />
          </button>
        </div>

        {secenekler.length === 0 ? (
          <div style={{ padding: "34px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: c.textSecondary, fontSize: 14 }}>
            <IconCheck size={24} color={c.success} />
            {t("Hepsi panoda")}
          </div>
        ) : (
          <div className="pano-ekle-izgara">
            {secenekler
              .filter((s) => s.grup === aktif)
              .map((s) => (
                <button key={s.id} type="button" onClick={() => onSec(s)} className="pano-ekle-kutu" style={{ borderColor: c.border, background: c.surface, color: c.textPrimary }}>
                  <span style={{ width: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: s.kapakArka ?? c.background }}>
                    {!s.kapakArka && <s.Icon size={22} color={c.accentDark} />}
                  </span>
                  <span className="pano-ekle-ad">{s.ad}</span>
                </button>
              ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
          <button
            type="button"
            onClick={() => {
              if (!sifirlaOnay) return setSifirlaOnay(true);
              onSifirla();
            }}
            onBlur={() => setSifirlaOnay(false)}
            style={{ padding: 0, border: "none", background: "transparent", fontSize: 13, color: sifirlaOnay ? c.danger : c.textSecondary }}
          >
            {sifirlaOnay ? t("Düzenin silinecek, emin misin?") : t("Varsayılan düzene dön")}
          </button>
          <Link to="/settings" style={{ color: c.textSecondary }}>
            {t("Tüm ayarlar")}
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
