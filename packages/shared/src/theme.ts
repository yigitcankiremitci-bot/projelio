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

/**
 * `colors.light`/`colors.dark`'ın hex literal'leri yerine geçen genel tip.
 * Seçili accent'e göre değerleri değişen dinamik bir palet (bkz. apps/web
 * ThemeProvider) `typeof colors.light`'a atanamaz — o tip her alanı sabit bir
 * hex literal'e kilitliyor. Renk paletini parametre olarak alan yardımcı
 * fonksiyonlar/tipler bunun yerine bu tipi kullanmalı.
 */
export type ThemeColors = Record<keyof typeof colors.light, string>;

/**
 * Vurgu (accent) rengi alternatifleri. "bronze" mevcut/varsayılan paleti
 * birebir korur — kullanıcı hiç seçim yapmazsa görünüm değişmez.
 */
export type AccentKey = "bronze" | "indigo" | "pine" | "wine";

export const accentPresets: Record<
  AccentKey,
  { label: string; light: { accent: string; accentDark: string }; dark: { accent: string; accentDark: string } }
> = {
  bronze: {
    label: "Bronz",
    light: { accent: "#C0813F", accentDark: "#8C5A28" },
    dark: { accent: "#D9A868", accentDark: "#C0813F" },
  },
  indigo: {
    label: "Lacivert Mavi",
    light: { accent: "#4A5FC1", accentDark: "#34428C" },
    dark: { accent: "#8C9BE8", accentDark: "#6274D6" },
  },
  pine: {
    label: "Çam Yeşili",
    light: { accent: "#2F7A5B", accentDark: "#1F5A40" },
    dark: { accent: "#5FBE94", accentDark: "#3F9C74" },
  },
  wine: {
    label: "Bordo",
    light: { accent: "#9C3F52", accentDark: "#742C3D" },
    dark: { accent: "#D97690", accentDark: "#B85470" },
  },
};

/**
 * Sidebar rengi, genel tema modundan bağımsız kişiselleştirmedir — sidebar her
 * zaman koyu bir yüzey olduğu için (üstündeki beyaz/gri yazılar sabit) mod
 * değişse de aynı seçenekler kullanılabilir. "default" özel bir anahtardır:
 * sabit bir renk DEĞİL, o an ki `colors[mode].primaryDark` değerini kullanmak
 * anlamına gelir (bkz. useSidebarStyle.ts).
 */
export type SidebarColorKey = "default" | "gece" | "zeytin" | "bordo" | "orman";

export const sidebarColorPresets: Record<Exclude<SidebarColorKey, "default">, { label: string; value: string }> = {
  gece: { label: "Gece", value: "#14181F" },
  zeytin: { label: "Zeytin", value: "#2E3527" },
  bordo: { label: "Bordo", value: "#34202A" },
  orman: { label: "Orman", value: "#17301F" },
};

/** Sidebar'ın arkasına gelen ince doku deseni. Renkten bağımsız, üstüne biner. */
export type SidebarPatternKey = "none" | "dots" | "diagonal" | "grid";

export const sidebarPatterns: Record<SidebarPatternKey, { label: string; backgroundImage: string; backgroundSize: string }> = {
  none: { label: "Yok", backgroundImage: "none", backgroundSize: "auto" },
  dots: {
    label: "Noktalı",
    backgroundImage:
      "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\"><circle cx=\"2\" cy=\"2\" r=\"1\" fill=\"rgba(255,255,255,0.16)\"/></svg>')",
    backgroundSize: "16px 16px",
  },
  diagonal: {
    label: "Çizgili",
    backgroundImage:
      "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"12\" height=\"12\"><path d=\"M0 12 L12 0\" stroke=\"rgba(255,255,255,0.12)\" stroke-width=\"1\"/></svg>')",
    backgroundSize: "12px 12px",
  },
  grid: {
    label: "Kareli",
    backgroundImage:
      "url('data:image/svg+xml;utf8,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"20\" height=\"20\"><path d=\"M20 0H0V20\" fill=\"none\" stroke=\"rgba(255,255,255,0.10)\" stroke-width=\"1\"/></svg>')",
    backgroundSize: "20px 20px",
  },
};
