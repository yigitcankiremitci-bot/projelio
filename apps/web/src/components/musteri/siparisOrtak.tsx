import { SIPARIS_DURUMU_ETIKET, type SiparisDurumu } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";

/**
 * Sipariş/tahsilat ekranlarının ortak parçaları.
 * Durum ve rapor hesabı burada değil: packages/shared/src/tahsilat.ts
 */

/** Kullanıcının bugünü (YYYY-MM-DD). toISOString UTC verir; gece yarısından sonra dünü gösterirdi. */
export function bugunYerel(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-10" → "Ekim 2026" (arayüz diliyle). */
export function ayEtiketi(ay: string): string {
  const [y, m] = ay.split("-").map(Number);
  return new Intl.DateTimeFormat(bicimDili(), { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1))
  );
}

export function DurumRozeti({ durum }: { durum: SiparisDurumu }) {
  const c = useThemeColors();
  const t = useT();
  const renk =
    durum === "tahsil_edildi" ? c.success : durum === "gecikti" ? c.danger : durum === "kismi" ? c.warning : c.textSecondary;
  return (
    <span
      style={{
        fontSize: 11,
        padding: "1px 7px",
        borderRadius: 6,
        color: renk,
        border: `1px solid ${renk}55`,
        whiteSpace: "nowrap",
      }}
    >
      {t(SIPARIS_DURUMU_ETIKET[durum])}
    </span>
  );
}

export function Alan({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, ...style }}>
      <label style={{ fontSize: 12, color: c.textSecondary }}>{label}</label>
      {children}
    </div>
  );
}

export const TAM_GENISLIK: React.CSSProperties = { width: "100%", boxSizing: "border-box" };
