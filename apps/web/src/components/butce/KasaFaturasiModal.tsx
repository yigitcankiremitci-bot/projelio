import { useState } from "react";
import type { BudgetTransaction } from "@projelio/shared";
import { faturalarApi } from "../../api/faturalar";
import { MODULE_RECORD_CONFIGS } from "../../lib/moduleConfigs";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";
import KayitEkleri from "../KayitEkleri";
import Modal from "../Modal";

interface Props {
  kayit: BudgetTransaction;
  /** Bağ kurulunca/kalkınca defterin tazelenmesi için. */
  onDegisti: () => void;
  onClose: () => void;
}

/**
 * Kasa satırının faturası.
 *
 * Kasadan girilen fatura Fatura modülünde de GÖRÜNÜR: burada açılan şey ayrı
 * bir "kasa faturası" değil, modülün kendi kaydı. İkinci bir yerde ikinci bir
 * fatura listesi tutmak, ay sonunda hangisinin doğru olduğunu sorduracaktı
 * (bkz. migration 112 ve gelir-gider modülünün kaldırılma gerekçesi).
 *
 * Kayıt alanları (tutar, tarih, karşı taraf) satırdan kopyalanıyor; burada
 * sorulmuyor. Kullanıcının elinde zaten olan bir bilgiyi ikinci kez istemek,
 * iki kaydın birbirinden ayrışmasının da en kısa yolu.
 */
export default function KasaFaturasiModal({ kayit, onDegisti, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const ayar = MODULE_RECORD_CONFIGS.fm_fatura?.attachments;
  const [recordId, setRecordId] = useState(kayit.invoiceRecordId ?? "");
  const [calisiyor, setCalisiyor] = useState(false);
  const [hata, setHata] = useState("");

  const olustur = async () => {
    setHata("");
    setCalisiyor(true);
    try {
      const cevap = await faturalarApi.kasaFaturasi(kayit.id, { departmentId: kayit.departmentId });
      setRecordId(cevap.recordId);
      onDegisti();
    } catch (e: any) {
      setHata(e?.message ?? t("Fatura kaydı açılamadı."));
    } finally {
      setCalisiyor(false);
    }
  };

  const kaldir = async () => {
    setHata("");
    setCalisiyor(true);
    try {
      await faturalarApi.kasaFaturasiniKaldir(kayit.id);
      setRecordId("");
      onDegisti();
    } catch (e: any) {
      setHata(e?.message ?? t("Bağ kaldırılamadı."));
    } finally {
      setCalisiyor(false);
    }
  };

  return (
    <Modal title={t("Ödemenin faturası")} onClose={onClose} maxWidth={480} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {kayit.description || kayit.category || t("Kasa kaydı")} · {kayit.occurredAt.slice(0, 10)}
        </p>

        {!recordId ? (
          <>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
              {t(
                "Bu ödeme için Fatura modülünde bir kayıt açılır; tutar, tarih ve karşı taraf buradan kopyalanır. Belgeyi sonra yüklersiniz."
              )}
            </p>
            <button
              data-primary
              onClick={() => void olustur()}
              disabled={calisiyor}
              style={{
                padding: "9px 0",
                borderRadius: 8,
                border: "none",
                background: c.primary,
                color: c.onPrimary,
                fontSize: 14,
              }}
            >
              {calisiyor ? t("Açılıyor…") : t("Fatura kaydı aç")}
            </button>
          </>
        ) : (
          <>
            {ayar && <KayitEkleri recordId={recordId} ayar={ayar} />}
            <button
              onClick={() => void kaldir()}
              disabled={calisiyor}
              style={{ padding: "8px 0", fontSize: 13, color: c.danger }}
            >
              {t("Fatura bağını kaldır")}
            </button>
            <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>
              {t("Bağı kaldırmak fatura kaydını ve belgelerini silmez; yalnızca bu ödemeyle ilişkisini koparır.")}
            </p>
          </>
        )}

        {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
      </div>
    </Modal>
  );
}
