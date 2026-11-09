import { useState } from "react";
import { Z } from "../../lib/layout";
import { tourAnchor } from "../../lib/tour/types";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { IconSend, IconX } from "../icons";

/**
 * Anasayfanın altında yazmaya hazır duran Lio kutusu. Asıl sohbet (onaylar, ek,
 * geçmiş) yine AiAssistantPanel'de: gönderilen mesaj onu kutunun yerinde açar.
 * İkinci bir sohbet motoru yazılsaydı onay akışı iki yerde yaşardı.
 *
 * Telefonda kutu yalnızca paneli açar; orada klavyeyle yaşamayı panel biliyor
 * (bkz. gorunurAlan), sabit bir kutu klavyenin altında kalırdı.
 */
export default function LioSohbetCubugu({
  isDesktop,
  onGonder,
  onAc,
  onKapat,
}: {
  isDesktop: boolean;
  onGonder: (mesaj: string) => void;
  onAc: () => void;
  onKapat: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [metin, setMetin] = useState("");
  const gonder = () => {
    const mesaj = metin.trim();
    if (!mesaj) return;
    setMetin("");
    onGonder(mesaj);
  };
  const yuvarlak = { width: 34, height: 34, padding: 0, borderRadius: "50%", border: "none", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as const;

  return (
    <div
      {...tourAnchor("lio-launcher")}
      data-klavyede-gizle
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: isDesktop ? 92 : "calc(96px + env(safe-area-inset-bottom))",
        width: "min(600px, calc(100vw - 32px))",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 6,
        borderRadius: 26,
        background: c.surface,
        border: `1px solid ${c.border}`,
        boxShadow: "0 6px 24px rgba(26,31,41,0.18)",
        zIndex: Z.aiLauncher,
      }}
    >
      <img src="/lio-open.png" alt="" draggable={false} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
      {isDesktop ? (
        <input
          value={metin}
          onChange={(e) => setMetin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) gonder();
          }}
          placeholder={t("Lio'ya yaz")}
          aria-label={t("Lio'ya yaz")}
          style={{ flex: 1, minWidth: 0, height: 34, border: "none", outline: "none", background: "transparent", color: c.textPrimary, fontSize: 15 }}
        />
      ) : (
        <button type="button" onClick={onAc} style={{ flex: 1, minWidth: 0, height: 34, padding: 0, border: "none", background: "transparent", color: c.textSecondary, fontSize: 15, textAlign: "left" }}>
          {t("Lio'ya yaz")}
        </button>
      )}
      {isDesktop && (
        <button type="button" onClick={gonder} aria-label={t("Gönder")} title={t("Gönder")} style={{ ...yuvarlak, background: metin.trim() ? c.accent : "transparent" }}>
          <IconSend size={16} color={metin.trim() ? c.surface : c.textSecondary} />
        </button>
      )}
      <button type="button" onClick={onKapat} aria-label={t("Kapat")} title={t("Kapat")} style={yuvarlak}>
        <IconX size={16} color={c.textSecondary} />
      </button>
    </div>
  );
}
