import type { CSSProperties } from "react";
import type { ThemeColors } from "@projelio/shared";

/** Admin > E-posta bölümlerinin ortak stilleri (AdminMesajModal ile aynı dil). */

export const etiket = (c: ThemeColors): CSSProperties => ({ fontSize: 13, color: c.textSecondary, marginBottom: 5 });

export const alan = (c: ThemeColors): CSSProperties => ({
  width: "100%",
  padding: "8px 11px",
  borderRadius: 9,
  border: `1px solid ${c.border}`,
  fontSize: 14.5,
  color: c.textPrimary,
  background: c.background,
  fontFamily: "inherit",
  boxSizing: "border-box",
});

/**
 * Çok satırlı metin alanı. index.css TÜM textarea'lara sabit `height: 42px`
 * veriyor (tek satırlık giriş kutularıyla aynı boy); onu burada ezmezsek
 * `rows` hiç işlemiyor ve kutu tek satır görünüyordu.
 */
export const metinAlani = (c: ThemeColors, satir: number): CSSProperties => ({
  ...alan(c),
  height: "auto",
  minHeight: `${satir * 1.5 + 1.2}em`,
  padding: "10px 12px",
  resize: "vertical",
  lineHeight: 1.5,
});

export const dugme = (c: ThemeColors, tur: "birincil" | "ikincil" | "tehlike" = "ikincil"): CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 9,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  border: `1px solid ${tur === "birincil" ? c.accent : tur === "tehlike" ? c.danger : c.border}`,
  background: tur === "birincil" ? c.accent : c.surface,
  color: tur === "birincil" ? c.onPrimary : tur === "tehlike" ? c.danger : c.textPrimary,
  whiteSpace: "nowrap",
});

export const kart = (c: ThemeColors): CSSProperties => ({
  background: c.surface,
  border: `1px solid ${c.border}`,
  borderRadius: 12,
  padding: 16,
});

export const rozet = (c: ThemeColors, vurgu = false): CSSProperties => ({
  display: "inline-block",
  fontSize: 11.5,
  padding: "2px 8px",
  borderRadius: 999,
  border: `1px solid ${vurgu ? c.accent : c.border}`,
  color: vurgu ? c.accent : c.textSecondary,
  whiteSpace: "nowrap",
});

/** Birim gösterimi: 1.234,5 birim. Tüm e-posta ekranlarında aynı biçim. */
export function birimYaz(birim: number, locale: string): string {
  return birim.toLocaleString(locale === "en" ? "en-US" : "tr-TR", { maximumFractionDigits: 1 });
}
