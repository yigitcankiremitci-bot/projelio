import type { ButceTTablosu } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { useT } from "../../lib/i18n";
import { fmtPara } from "./butceBicim";

interface Props {
  tablo: ButceTTablosu;
}

/**
 * Muhasebedeki T hesabı: SOLDA gelir, SAĞDA gider, altta bakiye.
 *
 * Neden tek liste değil: gelir ve gider tek listede iç içe geçtiğinde hangi
 * tarafın ağır bastığı okunmuyor — bakan kişi satırları tek tek toplamak
 * zorunda kalıyor. T düzeni bu soruyu bir bakışta cevaplıyor.
 *
 * Satırlar kategoriye göre TOPLANMIŞ gelir (tek tek hareket değil): "Kira" üç
 * ayrı fişten geldiyse T tablosunda tek satırdır. Hareketlerin kendisi
 * defterde, aşağıda duruyor.
 *
 * Her para birimi için AYRI bir T çizilir (bkz. ButceSayfasi.tTablolari):
 * tek T'de iki birim göstermek "gelir toplamı" satırını anlamsız kılardı.
 */
export default function TTablosu({ tablo }: Props) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
      }}
    >
      <div style={{ display: "grid", gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr" }}>
        <Sutun
          baslik={t("Gelir")}
          satirlar={tablo.gelir}
          toplam={tablo.gelirToplam}
          currency={tablo.currency}
          renk={c.success}
          isaret="+"
          kenar={isDesktop}
        />
        <Sutun
          baslik={t("Gider")}
          satirlar={tablo.gider}
          toplam={tablo.giderToplam}
          currency={tablo.currency}
          renk={c.danger}
          isaret="−"
        />
      </div>

      {/* Bakiye T'nin altındaki çizgi: iki sütunun farkı. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "10px 14px",
          borderTop: `2px solid ${c.border}`,
          background: c.background,
        }}
      >
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {t("Bakiye")} · {tablo.currency}
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            color: tablo.bakiye >= 0 ? c.success : c.danger,
          }}
        >
          {fmtPara(tablo.bakiye, tablo.currency)}
        </span>
      </div>
    </div>
  );
}

function Sutun({
  baslik,
  satirlar,
  toplam,
  currency,
  renk,
  isaret,
  kenar,
}: {
  baslik: string;
  satirlar: ButceTTablosu["gelir"];
  toplam: number;
  currency: string;
  renk: string;
  isaret: string;
  kenar?: boolean;
}) {
  const c = useThemeColors();
  const t = useT();

  return (
    <div style={{ borderRight: kenar ? `1px solid ${c.border}` : undefined, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "9px 14px",
          fontSize: 13,
          fontWeight: 500,
          color: renk,
          background: c.background,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <span>{baslik}</span>
        <span>
          {isaret}
          {fmtPara(toplam, currency)}
        </span>
      </div>

      {satirlar.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: 14 }}>{t("Kayıt yok.")}</p>
      ) : (
        satirlar.map((satir) => (
          <div key={satir.category} style={{ padding: "9px 14px", borderBottom: `1px solid ${c.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                {satir.category}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: renk, flexShrink: 0 }}>
                {isaret}
                {fmtPara(satir.amount, currency)}
              </span>
            </div>

            {/* Payı gösteren şerit: "en çok nereye gitti" sorusu rakamları
                okumadan cevaplanabilsin. Yüzde aynı YÖNDEKİ toplama göre. */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
              <div style={{ flex: 1, height: 4, borderRadius: 999, background: c.border, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(100, satir.yuzde)}%`, height: "100%", background: renk }} />
              </div>
              <span style={{ fontSize: 11, color: c.textSecondary, flexShrink: 0, minWidth: 32, textAlign: "right" }}>
                %{satir.yuzde.toFixed(0)}
              </span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
