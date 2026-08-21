import {
  COVER_TEXT_PRIMARY,
  COVER_TEXT_PRIMARY_DARK,
  COVER_TEXT_SECONDARY,
  COVER_TEXT_SECONDARY_DARK,
  COVER_TEXT_VEIL,
  COVER_TEXT_VEIL_DARK,
} from "../lib/covers";
import { useTheme } from "./ThemeProvider";

/**
 * Kapak (EntityCover, ProjectDetail vb.) üstündeki perde + yazı renkleri,
 * uygulamanın aydınlık/karanlık moduna göre. Kapağın kendi görseli (fotoğraf/
 * gradyan) hep sabit kalır — değişen yalnızca yazının okunması için üstüne
 * binen perde ve yazı rengi.
 */
export function useCoverTheme() {
  const { mode } = useTheme();
  if (mode === "dark") {
    return { veil: COVER_TEXT_VEIL_DARK, primary: COVER_TEXT_PRIMARY_DARK, secondary: COVER_TEXT_SECONDARY_DARK, dark: true };
  }
  return { veil: COVER_TEXT_VEIL, primary: COVER_TEXT_PRIMARY, secondary: COVER_TEXT_SECONDARY, dark: false };
}
