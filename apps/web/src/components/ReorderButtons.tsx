import type { CSSProperties } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { IconChevronUp, IconChevronDown } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Kart üstü gibi görsel arka plan üzerinde kullanılınca kontrast için ver. */
  background?: string;
  iconColor?: string;
}

export default function ReorderButtons({ isFirst, isLast, onMoveUp, onMoveDown, background, iconColor }: Props) {
  const c = useThemeColors();
  const t = useT();
  const color = iconColor ?? c.textPrimary;

  const btnStyle = (disabled: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 22,
    borderRadius: 6,
    border: "none",
    background: background ?? "transparent",
    opacity: disabled ? 0.3 : 1,
    cursor: disabled ? "default" : "pointer",
    padding: 0,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={t("Yukarı taşı")}
        disabled={isFirst}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isFirst) onMoveUp();
        }}
        style={btnStyle(isFirst)}
      >
        <IconChevronUp size={14} color={color} />
      </button>
      <button
        type="button"
        aria-label={t("Aşağı taşı")}
        disabled={isLast}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isLast) onMoveDown();
        }}
        style={btnStyle(isLast)}
      >
        <IconChevronDown size={14} color={color} />
      </button>
    </div>
  );
}
