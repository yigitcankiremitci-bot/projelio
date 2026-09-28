import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { colors, accentPresets } from "@projelio/shared";
import type { AccentKey, SidebarColorKey, SidebarPatternKey, ThemeColors, ThemeMode } from "@projelio/shared";
import {
  getAccentKey,
  getSidebarColorKey,
  getSidebarPatternKey,
  getThemePreference,
  setAccentKey as persistAccentKey,
  setSidebarColorKey as persistSidebarColorKey,
  setSidebarPatternKey as persistSidebarPatternKey,
  setThemePreference as persistThemePreference,
} from "./preferences";
import type { ThemePreference } from "./preferences";
import { sistemCubuklariniTemayaUydur } from "../lib/mobilKabuk";

interface ThemeContextValue {
  /** Ekrana UYGULANAN mod — "Sistem" seçiliyse cihaza bakılarak çözülmüş hâli. */
  mode: ThemeMode;
  /** Kullanıcının seçimi (Ayarlar > Tema): aydınlık, karanlık ya da sistem. */
  preference: ThemePreference;
  accentKey: AccentKey;
  colors: ThemeColors;
  sidebarColorKey: SidebarColorKey;
  sidebarPatternKey: SidebarPatternKey;
  setPreference: (pref: ThemePreference) => void;
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

const KOYU_SORGU = "(prefers-color-scheme: dark)";

function cihazKoyuMu(): boolean {
  try {
    return window.matchMedia(KOYU_SORGU).matches;
  } catch {
    return true;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(getThemePreference);
  const [cihazKoyu, setCihazKoyu] = useState<boolean>(cihazKoyuMu);
  const mode: ThemeMode = preference === "system" ? (cihazKoyu ? "dark" : "light") : preference;

  // "Sistem" seçiliyken cihazın ayarı değişince (telefonun gece modu akşam
  // kendiliğinden açılır) uygulama da o an değişsin; yeniden açılmayı beklemesin.
  // Mobil kabukta da çalışır: uygulamanın Android teması DayNight, WebView
  // cihazın ayarını sayfaya iletiyor (bkz. apps/mobile styles.xml).
  useEffect(() => {
    if (preference !== "system") return;
    let sorgu: MediaQueryList;
    try {
      sorgu = window.matchMedia(KOYU_SORGU);
    } catch {
      return;
    }
    const degisti = () => setCihazKoyu(sorgu.matches);
    degisti();
    sorgu.addEventListener?.("change", degisti);
    return () => sorgu.removeEventListener?.("change", degisti);
  }, [preference]);
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

  // Mobil kabukta sistem çubuklarının (saat, pil, gezinme çizgisi) rengi de
  // temayla birlikte değişmeli; tarayıcıda bu çağrı hiçbir şey yapmaz
  // (bkz. lib/mobilKabuk.ts). Renklere değil MODA bağlı: accent değişince
  // sistem çubuğunda değişecek bir şey yok.
  useEffect(() => {
    sistemCubuklariniTemayaUydur(mode);
  }, [mode]);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    persistThemePreference(next);
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
    preference,
    accentKey,
    colors: themeColors,
    sidebarColorKey,
    sidebarPatternKey,
    setPreference,
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
