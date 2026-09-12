import { BUDGET_SCOPE_LABEL, type ButceKademeOzeti } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara } from "./butceBicim";

interface Props {
  cocuklar: ButceKademeOzeti[];
  currency: string;
  /** Satıra tıklanınca o kademenin kendi bütçe sayfasına götürür. */
  onAc?: (cocuk: ButceKademeOzeti) => void;
}

/**
 * Bir alt kademedeki birimlerin kırılımı — holding için şirketler, şirket için
 * iş ve departmanlar, iş için projeler.
 *
 * HİYERARŞİNİN GÖRÜNDÜĞÜ YER BURASI. Üst kademedeki toplam rakam tek başına
 * "nereden geldi" sorusunu cevaplamıyor; bu liste onu açıyor ve bir tık aşağı
 * inme yolu veriyor.
 *
 * Çubuklar mutlak tutara göre değil, en büyük kalemin payına göre: 12 şirketin
 * hepsi aynı boyda çizilseydi hangisinin yükü taşıdığı görünmezdi.
 */
export default function KademeKirilimi({ cocuklar, currency, onAc }: Props) {
  const c = useThemeColors();
  const t = useT();

  const satirlar = cocuklar
    .map((cocuk) => {
      const toplam = cocuk.toplam.find((x) => x.currency === currency);
      return { cocuk, income: toplam?.income ?? 0, expense: toplam?.expense ?? 0, net: toplam?.net ?? 0 };
    })
    // Hiç hareketi olmayan birimler listeyi şişirmesin: 40 projeli bir işte
    // 38 boş satır, dolu 2 satırı gizler.
    .filter((s) => s.income !== 0 || s.expense !== 0)
    .sort((a, b) => b.income + b.expense - (a.income + a.expense));

  if (satirlar.length === 0) {
    return (
      <div
        style={{
          border: `1px dashed ${c.border}`,
          borderRadius: 12,
          padding: 22,
          textAlign: "center",
          color: c.textSecondary,
          fontSize: 14,
        }}
      >
        {t("Alt kademelerden henüz bir hareket toplanmadı.")}
      </div>
    );
  }

  const enBuyuk = Math.max(...satirlar.map((s) => s.income + s.expense), 1);

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, overflow: "hidden" }}>
      {satirlar.map(({ cocuk, income, expense, net }) => {
        const pay = (income + expense) / enBuyuk;
        const gelirPayi = income + expense === 0 ? 0 : (income / (income + expense)) * 100;
        const tiklanabilir = !!onAc;
        return (
          <div
            key={`${cocuk.scopeType}-${cocuk.scopeId}`}
            onClick={tiklanabilir ? () => onAc?.(cocuk) : undefined}
            role={tiklanabilir ? "button" : undefined}
            tabIndex={tiklanabilir ? 0 : undefined}
            onKeyDown={
              tiklanabilir
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") onAc?.(cocuk);
                  }
                : undefined
            }
            style={{
              padding: "10px 14px",
              borderBottom: `1px solid ${c.border}`,
              cursor: tiklanabilir ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontSize: 10.5,
                  color: c.textSecondary,
                  border: `1px solid ${c.border}`,
                  borderRadius: 999,
                  padding: "1px 7px",
                  flexShrink: 0,
                }}
              >
                {t(BUDGET_SCOPE_LABEL[cocuk.scopeType])}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 14,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {cocuk.ad}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: net >= 0 ? c.success : c.danger, flexShrink: 0 }}>
                {fmtPara(net, currency)}
              </span>
            </div>

            {/* Tek şeritte iki renk: solda gelirin payı, sağda giderin. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div
                style={{
                  width: `${Math.max(6, pay * 100)}%`,
                  height: 5,
                  borderRadius: 999,
                  overflow: "hidden",
                  display: "flex",
                  background: c.border,
                }}
              >
                <div style={{ width: `${gelirPayi}%`, background: c.success }} />
                <div style={{ width: `${100 - gelirPayi}%`, background: c.danger }} />
              </div>
              <span style={{ fontSize: 11, color: c.textSecondary, flexShrink: 0 }}>
                +{fmtPara(income, currency, true)} · −{fmtPara(expense, currency, true)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
