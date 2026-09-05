import { useCallback, useEffect, useState } from "react";
import type { WhatsappOverview, WhatsappStatusEvent } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import ConfirmDialog from "./ConfirmDialog";
import { useT } from "../lib/i18n";

/**
 * Ayarlar › Hesap'taki "WhatsApp numarası" satırı — SALT OKUNUR.
 *
 * Kullanıcı numarayı buraya yazmaz: doğrulanmış numara, kullanıcının kendi
 * telefonundan Projelio numarasına kod (ya da EVET) göndermesiyle oluşur;
 * WhatsApp gönderenin o telefona sahip olduğunu zaten kanıtlıyor. Serbest
 * yazılan bir numaraya bildirim atmak hem yanlış kişiye gidebilir hem de
 * "tanımadığı kişiye ilk mesaj" kısıtına takılır (docs/whatsapp-qr-plan.md §13).
 */
export default function WhatsappProfileCard() {
  const c = useThemeColors();
  const t = useT();
  const [overview, setOverview] = useState<WhatsappOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const reload = useCallback(() => whatsappApi.overview().then(setOverview).catch(() => setOverview(null)), []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (_event: WhatsappStatusEvent) => void reload();
    socket.on("whatsapp-status", handler);
    return () => {
      socket.off("whatsapp-status", handler);
    };
  }, [reload]);

  if (!overview || !overview.configured) return null;

  const me = overview.me;
  const linked = me.optInState !== "not_linked" && me.phoneMasked;

  const handleUnlink = async () => {
    setConfirmUnlink(false);
    setBusy(true);
    setError("");
    try {
      await whatsappApi.unlink();
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Bağlantı kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {linked ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 15, color: c.textPrimary }}>
              <strong style={{ fontWeight: 500 }}>{me.phoneMasked}</strong>
              <span style={{ color: c.success, fontSize: 14 }}> {t("· doğrulandı")}</span>
              {me.optInState === "opted_out" && <span style={{ color: c.textSecondary, fontSize: 14 }}> {t("· bildirimler durdurulmuş")}</span>}
            </div>
            {me.verifiedAt && (
              <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>
                {new Date(me.verifiedAt).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} tarihinde telefonunuzdan
                gönderdiğiniz mesajla eşleşti.
              </div>
            )}
          </div>
          <button
            onClick={() => setConfirmUnlink(true)}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.danger,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("Bağlantıyı kaldır")}
          </button>
        </div>
      ) : (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
          Doğrulanmış bir WhatsApp numaranız yok. Numara elle yazılmaz: Bağlı hesaplar sekmesinden kod alıp telefonunuzdan gönderin;
          numara kendiliğinden burada görünür.
        </p>
      )}
      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}
      {confirmUnlink && (
        <ConfirmDialog
          title={t("WhatsApp numarasını hesaptan ayır")}
          message="Bu numaraya artık bildirim gitmez. Yeni numara ya da cihaz için Bağlı hesaplar'dan yeniden kod alırsınız."
          confirmLabel={t("Ayır")}
          onConfirm={handleUnlink}
          onCancel={() => setConfirmUnlink(false)}
        />
      )}
    </div>
  );
}
