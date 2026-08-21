import { sidebarColorPresets, sidebarPatterns } from "@projelio/shared";
import { useTheme } from "./ThemeProvider";

/**
 * Sidebar'ın arka plan rengi + doku deseni. Renk "default" ise genel temanın
 * primaryDark'ını kullanır (eski davranış); değilse sidebarColorPresets'teki
 * sabit tondur. Context'ten okunduğu için Ayarlar sayfasındaki seçim anında
 * (navigasyon beklemeden) sidebar'a yansır.
 */
export function useSidebarStyle() {
  const { colors: c, sidebarColorKey, sidebarPatternKey } = useTheme();
  const background = sidebarColorKey === "default" ? c.primaryDark : sidebarColorPresets[sidebarColorKey].value;
  const pattern = sidebarPatterns[sidebarPatternKey];
  return { background, backgroundImage: pattern.backgroundImage, backgroundSize: pattern.backgroundSize };
}
