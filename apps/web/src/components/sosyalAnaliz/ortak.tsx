import type { CSSProperties } from "react";
import type { IcerikTuru, PerformansEtiketi, Translate } from "@projelio/shared";
import { bicimDili } from "../../lib/i18n/depo";
import { useThemeColors } from "../../theme/useThemeColors";

/**
 * Analiz sekmesinin küçük ortak parçaları: sayı biçimi, tür adı, performans
 * rozeti ve Lio'nun madde listeleri. Dört bileşen aynı rozeti ve aynı sayı
 * yazımını kullanıyor; kopyalar ayrışınca "12,4 B" bir yerde "12.400" diğer
 * yerde görünüyordu.
 */

/** 12400 → "12,4 B" (TR) / "12.4K" (EN). Küçük sayılar olduğu gibi. */
export function kisaSayi(n: number | undefined | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "–";
  return new Intl.NumberFormat(bicimDili(), { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

export function katYazisi(kat: number): string {
  return kat.toLocaleString(bicimDili(), { maximumFractionDigits: 1 });
}

export function sureYazisi(ms: number | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  return `${(ms / 1000).toLocaleString(bicimDili(), { maximumFractionDigits: 1 })} sn`;
}

export function turAdi(tur: IcerikTuru, t: Translate): string {
  if (tur === "reels") return t("Reels");
  if (tur === "karusel") return t("Karusel");
  if (tur === "video") return t("Video");
  return t("Görsel");
}

export function PerformansRozeti({
  etiket,
  kat,
  t,
}: {
  etiket: PerformansEtiketi | null | undefined;
  kat: number | null | undefined;
  t: Translate;
}) {
  const c = useThemeColors();
  if (!etiket) return null;
  const renk =
    etiket === "yildiz" ? c.success : etiket === "iyi" ? c.primary : etiket === "zayif" ? c.danger : c.textSecondary;
  const yazi =
    etiket === "yeni"
      ? t("Yeni — metrikler oturuyor")
      : kat !== null && kat !== undefined
        ? t("Normalin {kat} katı", { kat: katYazisi(kat) })
        : "";
  if (!yazi) return null;
  return (
    <span
      title={
        etiket === "yeni"
          ? t("İlk 48 saatte metrikler hızla değiştiği için kıyasa girmez.")
          : t("Hesabının medyan izlenmesine göre.")
      }
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "2px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        color: renk,
        background: `${renk}16`,
        border: `1px solid ${renk}33`,
      }}
    >
      {etiket === "yildiz" ? "★ " : ""}
      {yazi}
    </span>
  );
}

/** Lio'nun başlıklı madde listesi ("Neden böyle gitti", "Tekrarla"…). */
export function MaddeListesi({ baslik, maddeler, renk }: { baslik: string; maddeler: string[]; renk?: string }) {
  const c = useThemeColors();
  if (!maddeler.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: renk ?? c.textPrimary }}>{baslik}</span>
      <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
        {maddeler.map((m, i) => (
          <li key={i} style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function useAnalizStilleri() {
  const c = useThemeColors();
  const kart: CSSProperties = {
    border: `1px solid ${c.border}`,
    borderRadius: 10,
    background: c.surface,
    padding: 12,
  };
  const ikincilDugme: CSSProperties = {
    fontSize: 12,
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    cursor: "pointer",
  };
  const birincilDugme: CSSProperties = {
    fontSize: 13,
    padding: "6px 14px",
    borderRadius: 8,
    border: "none",
    background: c.primary,
    color: c.onPrimary,
    cursor: "pointer",
  };
  const alan: CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    fontSize: 13,
    padding: "7px 9px",
    borderRadius: 7,
    border: `1px solid ${c.border}`,
    background: c.background,
    color: c.textPrimary,
  };
  return { c, kart, ikincilDugme, birincilDugme, alan };
}
