import { useThemeColors } from "../theme/useThemeColors";
import { IconChevronDown } from "./icons";

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  /** Kapalıyken gösterilen kayıt sayısı; başlık tek başına "boş mu, gizli mi?" sorusunu cevaplamıyor. */
  count?: number;
  showLabel: string;
  hideLabel: string;
}

/** Bölüm başlığının yanındaki küçük aç/kapa düğmesi (bkz. useKatlanirBolum). */
export default function SectionToggle({ collapsed, onToggle, count, showLabel, hideLabel }: Props) {
  const c = useThemeColors();
  const label = collapsed ? showLabel : hideLabel;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={label}
      title={label}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 6px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: c.textSecondary,
        fontSize: 13,
      }}
    >
      {collapsed && count !== undefined && count > 0 && <span>{count}</span>}
      <span
        style={{
          display: "flex",
          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          transition: "transform 220ms ease",
        }}
      >
        <IconChevronDown size={16} color={c.textSecondary} />
      </span>
    </button>
  );
}
