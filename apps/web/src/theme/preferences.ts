// Tema tercihleri: görünüm modu (aydınlık/karanlık), vurgu rengi, sidebar
// rengi ve sidebar deseni. fontScale.ts ile aynı desen: localStorage'da
// tutulur, ThemeProvider bunları okuyup uygular. index.html'deki satır içi
// script de "mode" değerini boyamadan önce okur (bkz. THEME_MODE_KEY) — bu
// dosyadaki anahtar adlarıyla senkron kalmalı.
import type { AccentKey, SidebarColorKey, SidebarPatternKey, ThemeMode } from "@projelio/shared";

export const THEME_MODE_KEY = "projelio_theme_mode";
export const ACCENT_KEY = "projelio_accent";
export const SIDEBAR_COLOR_KEY = "projelio_sidebar_color";
export const SIDEBAR_PATTERN_KEY = "projelio_sidebar_pattern";

export function getThemeMode(): ThemeMode {
  return localStorage.getItem(THEME_MODE_KEY) === "dark" ? "dark" : "light";
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(THEME_MODE_KEY, mode);
}

export function getAccentKey(): AccentKey {
  const stored = localStorage.getItem(ACCENT_KEY);
  if (stored === "bronze" || stored === "indigo" || stored === "pine" || stored === "wine") return stored;
  return "bronze";
}

export function setAccentKey(key: AccentKey) {
  localStorage.setItem(ACCENT_KEY, key);
}

export function getSidebarColorKey(): SidebarColorKey {
  const stored = localStorage.getItem(SIDEBAR_COLOR_KEY);
  if (stored === "default" || stored === "gece" || stored === "zeytin" || stored === "bordo" || stored === "orman") return stored;
  return "default";
}

export function setSidebarColorKey(key: SidebarColorKey) {
  localStorage.setItem(SIDEBAR_COLOR_KEY, key);
}

export function getSidebarPatternKey(): SidebarPatternKey {
  const stored = localStorage.getItem(SIDEBAR_PATTERN_KEY);
  if (stored === "dots" || stored === "diagonal" || stored === "grid") return stored;
  return "none";
}

export function setSidebarPatternKey(key: SidebarPatternKey) {
  localStorage.setItem(SIDEBAR_PATTERN_KEY, key);
}
