/**
 * Herhangi bir alanın/alan başlığının yanına konabilen küçük "?" rozeti.
 * Tıklanınca ilgili turu (istenirse doğrudan ilgili adımından) başlatır.
 *
 * Kullanım:
 *   <label>Tutar <TourHelpDot tour="butce-nasil-calisir" step="kayit-ekle" /></label>
 */

import { useThemeColors } from "../../theme/useThemeColors";
import { useTour } from "../../lib/tour/TourContext";
import { getTour } from "../../lib/tour/tours";
import { useT } from "../../lib/i18n";

interface Props {
  tour: string;
  step?: string;
  size?: number;
  label?: string;
}

export default function TourHelpDot({ tour, step, size = 17, label }: Props) {
  const c = useThemeColors();
  const t = useT();
  const { start } = useTour();
  const target = getTour(tour);
  if (!target) return null;

  const title = label ?? t("{tur} — sesli anlat", { tur: t(target.title) });

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(tour, step ? { fromStepId: step } : undefined);
      }}
      aria-label={title}
      title={title}
      style={{
        width: size,
        height: size,
        minWidth: size,
        padding: 0,
        marginLeft: 6,
        borderRadius: "50%",
        border: `1px solid ${c.border}`,
        background: c.surface,
        color: c.textSecondary,
        fontSize: Math.round(size * 0.62),
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        verticalAlign: "middle",
        cursor: "pointer",
      }}
    >
      ?
    </button>
  );
}
