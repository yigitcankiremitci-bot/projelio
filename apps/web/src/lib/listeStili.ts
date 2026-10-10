import type { CSSProperties } from "react";
import type { ThemeColors } from "@projelio/shared";

/**
 * Liste görünümünün ortak çizgisi: satırlar tek çerçevede, aralarında ince
 * çizgi, arka plan sıra sıra yüzey / listeSatirAlt. Bağlantı ve İlişkiler,
 * Müşteriler ve bütün kayıt listeleri (ModuleRecordsPanel) buradan alır —
 * biri değişip ötekisi eski kalmasın.
 */
export function listeCercevesi(c: ThemeColors): CSSProperties {
  return { display: "flex", flexDirection: "column", border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" };
}

export function listeSatiri(c: ThemeColors, sira: number): CSSProperties {
  return {
    background: sira % 2 === 0 ? c.surface : c.listeSatirAlt,
    borderTop: sira === 0 ? "none" : `1px solid ${c.border}`,
  };
}
