// Erişilebilirlik: kullanıcı Ayarlar sayfasından uygulamanın tamamının yazı
// (ve genel arayüz) boyutunu küçültüp büyütebilir. Değer localStorage'da
// tutulur ve index.html'deki satır içi script sayfa her yüklendiğinde (ilk
// boyamadan önce) bu değeri okuyup <html> öğesine uygular — bu dosyadaki
// sabitlerle senkron kalmalı.

export const FONT_SCALE_STORAGE_KEY = "projelio_font_scale";

export type FontScaleOption = "xsmall" | "small" | "normal" | "large" | "xlarge";

export const FONT_SCALE_OPTIONS: FontScaleOption[] = ["xsmall", "small", "normal", "large", "xlarge"];

export const FONT_SCALE_VALUES: Record<FontScaleOption, number> = {
  xsmall: 0.85,
  small: 0.92,
  normal: 1,
  large: 1.15,
  xlarge: 1.3,
};

export const FONT_SCALE_LABELS: Record<FontScaleOption, string> = {
  xsmall: "Çok küçük",
  small: "Küçük",
  normal: "Normal",
  large: "Büyük",
  xlarge: "En büyük",
};

export function getFontScaleOption(): FontScaleOption {
  const stored = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
  if (stored === "xsmall" || stored === "small" || stored === "large" || stored === "xlarge") return stored;
  return "normal";
}

export function setFontScaleOption(option: FontScaleOption) {
  localStorage.setItem(FONT_SCALE_STORAGE_KEY, option);
}
