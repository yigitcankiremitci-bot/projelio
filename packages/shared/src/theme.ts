/**
 * Projelio Marka Renk Paleti
 * Ana: Derin Okyanus Mavisi / Koyu Indigo — güven, profesyonellik, istikrar
 * İkincil: Sıcak Altın Sarı / Kehribar — bütçe, tamamlanma, premium his
 */
export const colors = {
  light: {
    primary: "#1E3A8A",       // Derin Okyanus Mavisi
    primaryDark: "#152A63",
    accent: "#F59E0B",        // Kehribar
    accentDark: "#B45309",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    border: "#E2E8F0",
    success: "#16A34A",
    danger: "#DC2626",
    warning: "#F59E0B",
  },
  dark: {
    primary: "#3B5FCB",
    primaryDark: "#1E3A8A",
    accent: "#FBBF24",
    accentDark: "#D97706",
    background: "#0B1120",
    surface: "#111827",
    textPrimary: "#F1F5F9",
    textSecondary: "#94A3B8",
    border: "#1F2937",
    success: "#22C55E",
    danger: "#EF4444",
    warning: "#FBBF24",
  },
} as const;

export type ThemeMode = "light" | "dark";
