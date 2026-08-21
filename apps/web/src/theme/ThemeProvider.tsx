import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { colors, accentPresets } from "@projelio/shared";
import type { AccentKey, SidebarColorKey, SidebarPatternKey, ThemeColors, ThemeMode } from "@projelio/shared";
import {
  getAccentKey,
  getSidebarColorKey,
  getSidebarPatternKey,
  getThemeMode,
  setAccentKey as persistAccentKey,
  setSidebarColorKey as persistSidebarColorKey,
  setSidebarPatternKey as persistSidebarPatternKey,
  setThemeMode as persistThemeMode,
} from "./preferences";

interface ThemeContextValue {
  mode: ThemeMode;
  accentKey: AccentKey;
  colors: ThemeColors;
  sidebarColorKey: SidebarColorKey;
  sidebarPatternKey: SidebarPatternKey;
  setMode: (mode: ThemeMode) => void;
  setAccentKey: (key: AccentKey) => void;
  setSidebarColorKey: (key: SidebarColorKey) => void;
  setSidebarPatternKey: (key: SidebarPatternKey) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Saf CSS'te (::before, :hover gibi inline style'la yazılamayan yerler) kullanılan
// --color-* değişkenleri (bkz. index.css) burada JS tarafındaki renklerle senkron
// tutulur; aksi halde ör. sidebar'daki aktif satır işareti hep varsayılan bronz
// kalır, seçilen accent'e uymaz.
function syncCssVariables(c: ThemeColors) {
  const root = document.documentElement.style;
  root.setProperty("--color-primary", c.primary);
  root.setProperty("--color-primary-dark", c.primaryDark);
  root.setProperty("--color-accent", c.accent);
  root.setProperty("--color-accent-dark", c.accentDark);
  root.setProperty("--color-background", c.background);
  root.setProperty("--color-surface", c.surface);
  root.setProperty("--color-text-primary", c.textPrimary);
  root.setProperty("--color-text-secondary", c.textSecondary);
  root.setProperty("--color-placeholder", c.textSecondary);
  root.setProperty("--color-border", c.border);
  root.setProperty("--color-success", c.success);
  root.setProperty("--color-danger", c.danger);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(getThemeMode);
  const [accentKey, setAccentKeyState] = useState<AccentKey>(getAccentKey);
  const [sidebarColorKey, setSidebarColorKeyState] = useState<SidebarColorKey>(getSidebarColorKey);
  const [sidebarPatternKey, setSidebarPatternKeyState] = useState<SidebarPatternKey>(getSidebarPatternKey);

  const themeColors = useMemo<ThemeColors>(() => {
    const base = colors[mode];
    const accent = accentPresets[accentKey][mode];
    return { ...base, accent: accent.accent, accentDark: accent.accentDark };
  }, [mode, accentKey]);

  useEffect(() => {
    syncCssVariables(themeColors);
  }, [themeColors]);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    persistThemeMode(next);
  };

  const setAccentKeyFn = (key: AccentKey) => {
    setAccentKeyState(key);
    persistAccentKey(key);
  };

  const setSidebarColorKeyFn = (key: SidebarColorKey) => {
    setSidebarColorKeyState(key);
    persistSidebarColorKey(key);
  };

  const setSidebarPatternKeyFn = (key: SidebarPatternKey) => {
    setSidebarPatternKeyState(key);
    persistSidebarPatternKey(key);
  };

  const value: ThemeContextValue = {
    mode,
    accentKey,
    colors: themeColors,
    sidebarColorKey,
    sidebarPatternKey,
    setMode,
    setAccentKey: setAccentKeyFn,
    setSidebarColorKey: setSidebarColorKeyFn,
    setSidebarPatternKey: setSidebarPatternKeyFn,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme, ThemeProvider dışında çağrıldı.");
  return ctx;
}
