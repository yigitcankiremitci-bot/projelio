/**
 * Projelio Marka Renk Paleti
 * Logo renklerinden türetildi: koyu gri-lacivert (P harfi) + bronz-kehribar (onay işareti)
 * Ana: Gri-Lacivert (Slate Navy) — güven, profesyonellik, istikrar
 * İkincil: Bronz Kehribar (Amber Bronze) — bütçe, tamamlanma, premium his
 */
export const colors = {
  light: {
    primary: "#3E4858",
    primaryDark: "#1C222C",
    accent: "#C0813F",
    accentDark: "#8C5A28",
    background: "#F7F8FA",
    surface: "#FFFFFF",
    textPrimary: "#1A1F29",
    textSecondary: "#66707F",
    border: "#E3E6EB",
    success: "#2E9E5B",
    danger: "#C13434",
    warning: "#C0813F",
  },
  dark: {
    primary: "#8593A8",
    primaryDark: "#3E4858",
    accent: "#D9A868",
    accentDark: "#C0813F",
    background: "#12151B",
    surface: "#1B2028",
    textPrimary: "#F1F3F5",
    textSecondary: "#9AA2B0",
    border: "#2A3140",
    success: "#3FBE73",
    danger: "#E5605F",
    warning: "#D9A868",
  },
} as const;

export type ThemeMode = "light" | "dark";
