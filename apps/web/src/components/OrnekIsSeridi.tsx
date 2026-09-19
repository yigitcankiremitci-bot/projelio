import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { ornekIsApi } from "../api/ornekIs";
import ConfirmDialog from "./ConfirmDialog";

/**
 * Örnek işin sayfasında duran şerit: "bu bir örnek, işin bitince sil".
 *
 * NEDEN ŞERİT, düğme değil: örnek iş gerçek bir işe benziyor (bilerek) ve
 * yeni üye onun kendisine ait olmadığını, istediği gibi kurcalayabileceğini
 * ve tek tıkla kaldırabileceğini sayfaya girer girmez görmeli. Silme ayarlar
 * menüsüne gömülseydi örnek iş hesapta sonsuza kadar kalırdı.
 */
export default function OrnekIsSeridi() {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [onay, setOnay] = useState(false);

  const sil = async () => {
    await ornekIsApi.sil();
    setOnay(false);
    navigate("/", { replace: true });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
        margin: "8px 0 12px",
        padding: "12px 14px",
        borderRadius: 12,
        border: `1px solid ${c.accent}`,
        background: c.surface,
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: "1 1 260px" }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{t("Bu bir örnek iş")}</span>
        <span style={{ fontSize: 14, color: c.textSecondary, lineHeight: 1.45 }}>
          {t("Projeyi, görevleri ve rutini aç, dene, değiştir. İşin bitince hepsini tek tıkla kaldırabilirsin.")}
        </span>
      </span>
      <button
        type="button"
        onClick={() => setOnay(true)}
        style={{
          flexShrink: 0,
          padding: "8px 14px",
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          background: c.background,
          color: c.textPrimary,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        {t("Örnekleri sil")}
      </button>

      {onay && (
        <ConfirmDialog
          title={t("Örnekler silinsin mi?")}
          message={t(
            "Bu örnek iş; içindeki proje, görevler ve rutinle birlikte silinecek. Senin açtığın diğer işlere dokunulmaz."
          )}
          confirmLabel={t("Örnekleri sil")}
          onConfirm={sil}
          onCancel={() => setOnay(false)}
        />
      )}
    </div>
  );
}
