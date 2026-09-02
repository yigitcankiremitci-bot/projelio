import { useCallback, useEffect, useState } from "react";
import type { WhatsappConnectionSummary, WhatsappStatusEvent } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { getSocket } from "../lib/liveRoom";
import { useThemeColors } from "../theme/useThemeColors";
import { IconWhatsapp } from "./icons";
import WhatsappConnectionPanel from "./WhatsappConnectionPanel";

/**
 * Yönetici: WhatsApp numara havuzu. Numara ekle → QR okut → bağlı. Her
 * numara kaç kullanıcıya atanmış görünür; kopan numara elle yeniden
 * bağlanır. Soket olayı (`whatsapp-status`) listeyi tazeler.
 */
export default function WhatsappNumbersPanel() {
  const c = useThemeColors();
  const [numbers, setNumbers] = useState<WhatsappConnectionSummary[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    return whatsappApi.admin
      .list()
      .then((n) => {
        setNumbers(n);
        setError("");
      })
      .catch((e: any) => setError(e?.message ?? "Numaralar alınamadı."));
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

  const handleAdd = async () => {
    if (!label.trim()) return;
    setBusy(true);
    setError("");
    try {
      await whatsappApi.admin.add(label.trim());
      setLabel("");
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Numara eklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <IconWhatsapp size={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>WhatsApp numaraları</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>
            Havuzdaki numaralar kullanıcılara arka planda kalıcı olarak atanır; Lio ve bildirimler bu numaralardan gider.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
          placeholder="Etiket (ör. Destek 1)"
          style={{
            flex: 1,
            minWidth: 180,
            padding: "9px 12px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: c.background,
            color: c.textPrimary,
            fontSize: 15,
          }}
        />
        <button
          onClick={() => void handleAdd()}
          disabled={busy || !label.trim()}
          style={{
            padding: "9px 16px",
            borderRadius: 9,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 15,
            fontWeight: 500,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? "Ekleniyor…" : "Numara ekle"}
        </button>
      </div>

      {error && <p style={{ fontSize: 14, color: c.danger, margin: "0 0 10px" }}>{error}</p>}

      {numbers && numbers.length === 0 && (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
          Havuz boş. Bir etiket yazıp "Numara ekle" deyin; ardından o numaranın telefonuyla QR'ı okutun.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {numbers?.map((n) => (
          <WhatsappConnectionPanel key={n.id} number={n} onChanged={reload} />
        ))}
      </div>
    </div>
  );
}
