import type { ButceKademeOzeti, ParaBirimiToplami } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "./butceBicim";

interface Props {
  ozet: ButceKademeOzeti;
  /** Seçili para birimi — toplamlar birimler arasında karışmasın diye. */
  currency: string;
}

function bul(liste: ParaBirimiToplami[], currency: string): ParaBirimiToplami {
  return liste.find((t) => t.currency === currency) ?? { currency, income: 0, expense: 0, net: 0 };
}

/**
 * Kademenin özeti: net / gelir / gider + "kendi" ile "alttan gelen" ayrımı.
 *
 * KENDİ ile ALT NEDEN AYRI GÖSTERİLİYOR: "şirketin kendi kirası" ile
 * "departmanlarından toplanan giderler" tek kutuda birleşseydi, bakan kişi
 * 240.000 TL'lik gideri doğrulayamazdı — hangi kısmının buraya elle girildiği,
 * hangi kısmının aşağıdan geldiği görünmezdi. Rakamı doğrulanamayan bir bütçe
 * ekranı, olmayan bir bütçe ekranından kötüdür.
 */
export default function ButceOzetSeridi({ ozet, currency }: Props) {
  const c = useThemeColors();
  const t = useT();

  const kendi = bul(ozet.kendi, currency);
  const alt = bul(ozet.alt, currency);
  const toplam = bul(ozet.toplam, currency);
  const altVar = alt.income !== 0 || alt.expense !== 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        <Kart
          label={t("Net")}
          value={fmtPara(toplam.net, currency)}
          tone={toplam.net >= 0 ? "positive" : "negative"}
          vurgulu
        />
        <Kart label={t("Gelir")} value={fmtPara(toplam.income, currency)} tone="positive" />
        <Kart label={t("Gider")} value={fmtPara(toplam.expense, currency)} tone="negative" />
      </div>

      {altVar && (
        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            fontSize: 12,
            color: c.textSecondary,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            padding: "8px 11px",
          }}
        >
          <span>
            {t("Bu kademenin kendi kaydı")}:{" "}
            <strong style={{ color: c.textPrimary }}>{fmtPara(kendi.net, currency)}</strong>
          </span>
          <span>
            {t("Alt kademelerden")}:{" "}
            <strong style={{ color: c.textPrimary }}>{fmtPara(alt.net, currency)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

function Kart({
  label,
  value,
  tone,
  vurgulu,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  vurgulu?: boolean;
}) {
  const c = useThemeColors();
  return (
    <div
      style={{
        background: vurgulu ? `${c.accent}12` : c.surface,
        border: `1px solid ${vurgulu ? c.accent : c.border}`,
        borderRadius: 10,
        padding: "9px 11px",
      }}
    >
      <div style={{ fontSize: 11.5, color: c.textSecondary, marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: tone === "positive" ? c.success : tone === "negative" ? c.danger : c.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  );
}
