import { useCallback, useEffect, useState } from "react";
import type { WhatsappOverview, WhatsappStatusEvent } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { IconWhatsapp } from "./icons";
import WhatsappNotifyPanel from "./WhatsappNotifyPanel";
import { useT } from "../lib/i18n";

/**
 * Ayarlar › Bağlı hesaplar'daki WhatsApp kartı (havuz modeli).
 *
 * Numarayı kullanıcı bağlamaz — numaralar Projelio'nun, yöneticiler havuza
 * ekler (Admin › WhatsApp numaraları), kullanıcıya ilk ihtiyaçta arka planda
 * kalıcı bir numara atanır. Bu kart yalnızca kullanıcının kendi bildirim
 * eşleşmesini yönetir; numara durumu değişince soket olayı kartı tazeler.
 */
export default function WhatsappCard() {
  const c = useThemeColors();
  const t = useT();
  const [overview, setOverview] = useState<WhatsappOverview | null>(null);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    return whatsappApi
      .overview()
      .then((o) => {
        setOverview(o);
        setError("");
      })
      .catch((e: any) => setError(e?.message ?? "WhatsApp durumu alınamadı."));
  }, []);

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

  if (!overview && !error) return null;

  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: "18px 20px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <IconWhatsapp size={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{t("WhatsApp")}</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>{t("Görev ve son tarih bildirimleri WhatsApp'a da gelsin")}</div>
        </div>
      </div>

      {error && <p style={{ fontSize: 14, color: c.danger, margin: "0 0 8px" }}>{error}</p>}

      {overview && !overview.configured ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 4px" }}>{t("Bu özellik sunucuda henüz yapılandırılmamış.")}</p>
      ) : overview && !overview.poolReady && !overview.myNumber ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 4px", lineHeight: 1.5 }}>
          Henüz bağlı bir Projelio numarası yok; yönetici bir numara bağladığında burada görünecek.
        </p>
      ) : overview ? (
        <>
          {overview.myNumber && (
            <div style={{ fontSize: 14, color: c.textSecondary, marginBottom: 10 }}>
              {t("Projelio numaranız:")} <strong style={{ fontWeight: 500, color: c.textPrimary }}>{overview.myNumber.phoneMasked ?? overview.myNumber.label}</strong>
              {overview.myNumber.status !== "working" && <span style={{ color: c.warning }}> {t("· şu an bağlı değil")}</span>}
            </div>
          )}
          <WhatsappNotifyPanel overview={overview} onChanged={reload} />
        </>
      ) : null}
    </div>
  );
}
