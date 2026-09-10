import { kalanGun, vadeDurumu } from "../lib/butceOzeti";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Vadeye kalan süreyi renkle söyler: gecikmiş kırmızı, yaklaşan kehribar,
 * uzak olan sade tarih.
 *
 * Kasa ile proje bütçesi aynı rozeti kullanıyor — iki kopya olsaydı "gecikti"
 * eşiği bir ekranda değişip diğerinde kalırdı.
 */
export default function VadeRozeti({ tarih }: { tarih: string }) {
  const c = useThemeColors();
  const t = useT();
  const durum = vadeDurumu(tarih);
  const kalan = kalanGun(tarih);

  if (durum === "uzak") {
    return <span style={{ fontSize: 12, color: c.textSecondary }}>{formatDate(tarih)}</span>;
  }

  const renk = durum === "gecikti" ? c.danger : c.warning;
  const metin =
    durum === "gecikti"
      ? t("{gun} gün gecikti", { gun: -kalan })
      : durum === "bugun"
        ? t("Bugün ödenecek")
        : t("{gun} gün kaldı", { gun: kalan });

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: renk,
        background: `${renk}1a`,
        padding: "2px 8px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {metin}
    </span>
  );
}
