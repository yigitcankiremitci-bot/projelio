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

/**
 * Sekme hapı: Bağlantılar'ın liste sekmeleri ile Müşteriler'in görünüm
 * sekmeleri (Müşteriler · Potansiyel · Tahsilat) aynı biçimde (kullanıcı
 * isteği, 2026-10-20).
 */
export function sekmeStili(c: ThemeColors, aktif: boolean): CSSProperties {
  return {
    fontSize: 13,
    padding: "5px 12px",
    borderRadius: 999,
    border: `1px solid ${aktif ? c.primary : c.border}`,
    background: aktif ? c.primary : c.surface,
    color: aktif ? c.onPrimary : c.textPrimary,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

/** Sağ sütundaki ya da üstteki özet kutusu (Toplam, Müşteri, Beklenen…). */
export function ozetKutusu(c: ThemeColors): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    padding: "6px 12px",
    borderRadius: 8,
    background: c.background,
    border: `1px solid ${c.border}`,
    minWidth: 84,
  };
}
