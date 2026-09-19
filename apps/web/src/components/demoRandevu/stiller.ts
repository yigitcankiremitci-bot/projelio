import type { CSSProperties } from "react";
import type { useThemeColors } from "../../theme/useThemeColors";

/** Demo sayfalarının ortak düğme ve girdi görünümü (herkese açık sayfa, Ayarlar, admin). */
type Renkler = ReturnType<typeof useThemeColors>;

export function girdi(c: Renkler): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 15,
  };
}

export function anaDugme(c: Renkler): CSSProperties {
  return {
    background: c.primary,
    color: c.onPrimary,
    padding: "11px 18px",
    borderRadius: 10,
    border: "none",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  };
}

export function ikincilDugme(c: Renkler): CSSProperties {
  return {
    background: c.surface,
    color: c.textPrimary,
    padding: "10px 16px",
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  };
}
