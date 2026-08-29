import { useEffect, useState } from "react";
import { aiChat } from "../api/aiChat";
import type { AiCreditOrder } from "../api/aiChat";
import { useThemeColors } from "../theme/useThemeColors";

function formatTry(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

interface Props {
  /** Onay sonrası kullanıcı bakiyeleri listesini tazelemek için. */
  onCredited?: () => void;
}

/**
 * Yönetici: kredi siparişlerinin ödemesini onaylar.
 *
 * Ödeme sağlayıcısı bağlanana kadar krediyi bakiyeye geçiren tek self-servis yol
 * burasıdır — kullanıcının sipariş açması tek başına kredi kazandırmaz. Sağlayıcı
 * bağlandığında bu ekran gereksiz olmaz: havale/elden ödemeler ve sağlayıcının
 * bildiremediği durumlar için elle onay yine gerekir.
 *
 * "Ödendi ama kredi yüklenmedi" satırları ayrıca işaretlenir: markPaid iki adımdan
 * oluşuyor (durumu işaretle, krediyi yükle) ve arada bir hata olursa sipariş bu
 * halde kalır — yönetici yüklemeyi yeniden deneyebilsin diye görünür olmalı.
 */
export default function AiCreditOrdersAdmin({ onCredited }: Props) {
  const c = useThemeColors();
  const [orders, setOrders] = useState<AiCreditOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    aiChat
      .getAllCreditOrders()
      .then(setOrders)
      .catch(() => setError("Siparişler yüklenemedi."))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusyId(id);
    setError("");
    try {
      await run();
      load();
      onCredited?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem tamamlanamadı.");
    } finally {
      setBusyId(null);
    }
  };

  const pending = orders.filter((o) => o.status === "pending_payment");
  // Ödemesi onaylanmış ama kredisi geçmemiş siparişler — sessiz kalmamalı.
  const stuck = orders.filter((o) => o.status === "paid" && !o.creditedAt);

  const rowStyle = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderTop: `1px solid ${c.border}`,
    fontSize: 14,
    flexWrap: "wrap" as const,
  };

  const buttonStyle = (primary: boolean) => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: primary ? "none" : `1px solid ${c.border}`,
    background: primary ? c.primary : "transparent",
    color: primary ? "#fff" : c.textSecondary,
    fontSize: 13,
  });

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <h3 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>Kredi siparişleri</h3>
      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
        Ödemesi alınan siparişi onayla — kredi ancak onaydan sonra kullanıcının bakiyesine geçer.
      </p>

      {error && <p style={{ color: c.danger, fontSize: 13.5, margin: "0 0 10px" }}>{error}</p>}

      {stuck.length > 0 && (
        <div
          style={{
            marginBottom: 12,
            borderRadius: 9,
            border: `1px solid ${c.danger}`,
            background: `${c.danger}14`,
            overflow: "hidden",
          }}
        >
          <p style={{ margin: 0, padding: "9px 12px", fontSize: 13.5, color: c.danger, lineHeight: 1.5 }}>
            Ödemesi onaylanmış ama kredisi yüklenememiş sipariş var. Yükleme yeniden denenmeli.
          </p>
          {stuck.map((o) => (
            <div key={o.id} style={{ ...rowStyle, borderTop: `1px solid ${c.danger}44` }}>
              <span style={{ flex: 1, color: c.textPrimary }}>
                {o.userFullName ?? o.userEmail ?? o.userId} · {o.credits.toLocaleString("tr-TR")} kredi
              </span>
              <button
                onClick={() => act(o.id, () => aiChat.retryCreditOrder(o.id))}
                disabled={busyId === o.id}
                style={buttonStyle(true)}
              >
                {busyId === o.id ? "Yükleniyor…" : "Krediyi yükle"}
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
      ) : pending.length === 0 ? (
        <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0 }}>Ödeme bekleyen sipariş yok.</p>
      ) : (
        <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
          {pending.map((o, i) => (
            <div key={o.id} style={{ ...rowStyle, borderTop: i === 0 ? "none" : `1px solid ${c.border}` }}>
              <span style={{ flex: 1, minWidth: 160, color: c.textPrimary }}>
                {o.userFullName ?? o.userEmail ?? o.userId}
                <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary }}>
                  {o.credits.toLocaleString("tr-TR")} kredi · {formatTry(o.priceAmount)} ·{" "}
                  {new Date(o.createdAt).toLocaleDateString("tr-TR")}
                </span>
              </span>
              <button
                onClick={() => act(o.id, () => aiChat.markCreditOrderPaid(o.id))}
                disabled={busyId === o.id}
                style={buttonStyle(true)}
              >
                {busyId === o.id ? "İşleniyor…" : "Ödemeyi onayla"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
