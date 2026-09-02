import { useCallback, useEffect, useState } from "react";
import type { WhatsappOverview, WhatsappStatusEvent } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { IconWhatsapp } from "./icons";
import WhatsappConnectionPanel from "./WhatsappConnectionPanel";
import WhatsappNotifyPanel from "./WhatsappNotifyPanel";

/**
 * Ayarlar › Bağlı hesaplar'daki WhatsApp kartı.
 *
 * Tek çağrıyla (/whatsapp/me) organizasyon başına bir satır alır: sahibi
 * olduğun organizasyonlarda numarayı bağlama paneli, bağlı numarası olan her
 * organizasyonda kendi bildirim panelin. Veri tek yerden yüklenir, iki panel
 * de aynı `reload` ile tazelenir — soket olayı (`whatsapp-status`) geldiğinde
 * QR'dan "bağlandı"ya geçiş kullanıcı hiçbir şeye basmadan görünür.
 */
export default function WhatsappCard() {
  const c = useThemeColors();
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
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>WhatsApp</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>Görev ve son tarih bildirimleri WhatsApp'a da gelsin</div>
        </div>
      </div>

      {error && (
        <p style={{ fontSize: 14, color: c.danger, margin: "0 0 8px" }}>{error}</p>
      )}

      {overview && !overview.configured ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 4px" }}>
          Bu özellik sunucuda henüz yapılandırılmamış.
        </p>
      ) : overview && overview.organizations.length === 0 ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 4px" }}>
          WhatsApp bağlantısı organizasyon üzerinden kurulur; henüz bir organizasyonda değilsiniz.
        </p>
      ) : (
        overview?.organizations.map((org, i) => (
          <div
            key={org.organizationId}
            style={{
              paddingTop: i === 0 ? 4 : 14,
              marginTop: i === 0 ? 0 : 14,
              borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
            }}
          >
            {overview.organizations.length > 1 && (
              <div style={{ fontSize: 14, fontWeight: 500, color: c.textSecondary, marginBottom: 8 }}>
                {org.organizationName}
              </div>
            )}
            {org.canManage && <WhatsappConnectionPanel org={org} onChanged={reload} />}
            {org.connection?.status === "working" ? (
              <WhatsappNotifyPanel org={org} onChanged={reload} />
            ) : !org.canManage ? (
              <p style={{ fontSize: 15, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
                Organizasyon sahibi henüz bir WhatsApp numarası bağlamamış.
              </p>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
