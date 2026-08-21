import { useTheme } from "./ThemeProvider";

/** `colors.light`'ın yerine geçen, seçili tema moduna + accent'e göre değişen sürüm. */
export function useThemeColors() {
  return useTheme().colors;
}
