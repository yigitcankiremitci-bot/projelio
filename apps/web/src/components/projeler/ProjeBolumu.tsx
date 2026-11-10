import type { Project } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";

/**
 * Projeler sekmesindeki ayrı bölüm (pasif / tamamlanan). Kapatılmış rutinler
 * bölümüyle aynı görünüm: başlık + sayı + göster/gizle, açılınca soluk ızgara.
 * Boşsa hiç çizilmez. Izgara sürüklenmiyor: sıralama ana ızgaranın işi.
 */
export default function ProjeBolumu({
  baslik,
  projeler,
  acik,
  onToggle,
  kart,
}: {
  baslik: string;
  projeler: Project[];
  acik: boolean;
  onToggle: () => void;
  kart: (p: Project) => React.ReactNode;
}) {
  const c = useThemeColors();
  const t = useT();
  if (projeler.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={acik}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontSize: 17,
          fontWeight: 500,
          color: c.textPrimary,
        }}
      >
        {baslik}
        <span style={{ fontSize: 13, color: c.textSecondary, fontWeight: 400 }}>
          {t("{n} proje", { n: projeler.length })} · {acik ? t("gizle") : t("göster")}
        </span>
      </button>
      {acik && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 12,
            opacity: 0.72,
          }}
        >
          {projeler.map((p) => (
            <div key={p.id}>{kart(p)}</div>
          ))}
        </div>
      )}
    </div>
  );
}
