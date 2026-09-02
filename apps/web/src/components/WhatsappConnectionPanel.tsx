import { useEffect, useState } from "react";
import type { WhatsappOrganizationView } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { useThemeColors } from "../theme/useThemeColors";
import ConfirmDialog from "./ConfirmDialog";

/** QR görselinin tazelenme aralığı; WhatsApp QR'ı ~20 sn'de bir değiştirir. */
const QR_REFRESH_MS = 15_000;

/**
 * Organizasyon sahibinin numara bağlama paneli: Bağla → QR (ya da eşleştirme
 * kodu) → bağlı. Kopan bağlantı kendiliğinden yeniden BAŞLATILMAZ: düğme
 * insan kararı ister (bağlan/kop döngüsü ban tetikleyicisi).
 */
export default function WhatsappConnectionPanel({
  org,
  onChanged,
}: {
  org: WhatsappOrganizationView;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const conn = org.connection;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const status = conn?.status ?? "stopped";

  // QR yalnızca beklenirken çekilir; bağlanınca durur.
  useEffect(() => {
    if (status !== "scan_qr") {
      setQr(null);
      return;
    }
    let cancelled = false;
    const fetchQr = () =>
      whatsappApi
        .qr(org.organizationId)
        .then((r) => {
          if (!cancelled) setQr(r.qr);
        })
        .catch(() => {});
    void fetchQr();
    const timer = setInterval(fetchQr, QR_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [status, org.organizationId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      onChanged();
    } catch (e: any) {
      setError(e?.message ?? "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const handlePairing = () =>
    run(async () => {
      const { code } = await whatsappApi.pairingCode(org.organizationId, pairPhone);
      setPairCode(code);
    });

  const primaryButton = {
    padding: "9px 16px",
    borderRadius: 9,
    border: "none",
    background: c.primary,
    color: c.onPrimary,
    fontSize: 15,
    fontWeight: 500,
    cursor: busy ? "wait" : "pointer",
  } as const;

  const ghostButton = {
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: "transparent",
    fontSize: 15,
    cursor: "pointer",
  } as const;

  return (
    <div style={{ marginBottom: 12 }}>
      {status === "working" && conn ? (
        <>
          <div style={{ fontSize: 15, color: c.textPrimary, marginBottom: 6 }}>
            Bağlı numara: <strong style={{ fontWeight: 500 }}>{conn.phoneMasked}</strong>
            {conn.pushName ? <span style={{ color: c.textSecondary }}> · {conn.pushName}</span> : null}
          </div>
          {conn.pausedUntil && new Date(conn.pausedUntil) > new Date() && (
            <p style={{ fontSize: 14, color: c.warning, margin: "0 0 8px", lineHeight: 1.5 }}>
              WhatsApp gönderimi geçici olarak kısıtladı; bildirimler {new Date(conn.pausedUntil).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}'e
              kadar kuyrukta bekleyecek.{conn.pauseReason ? ` (${conn.pauseReason})` : ""}
            </p>
          )}
          <button onClick={() => setConfirmLogout(true)} disabled={busy} style={{ ...ghostButton, color: c.danger }}>
            Bağlantıyı kes
          </button>
        </>
      ) : status === "scan_qr" ? (
        <>
          <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
            Telefonda WhatsApp › Bağlı cihazlar › Cihaz bağla'ya girip bu kodu okutun. Kod kendiliğinden yenilenir.
          </p>
          {qr ? (
            <img src={qr} alt="WhatsApp QR" width={220} height={220} style={{ display: "block", borderRadius: 8, background: "#fff" }} />
          ) : (
            <div style={{ width: 220, height: 220, borderRadius: 8, background: c.border }} />
          )}
          <details style={{ marginTop: 12, fontSize: 14, color: c.textSecondary }}>
            <summary style={{ cursor: "pointer" }}>QR okutamıyorum, kodla bağlanayım</summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={pairPhone}
                onChange={(e) => setPairPhone(e.target.value)}
                placeholder="+90 5xx xxx xx xx"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: c.textPrimary,
                  fontSize: 15,
                }}
              />
              <button onClick={handlePairing} disabled={busy || !pairPhone.trim()} style={{ ...ghostButton, color: c.textPrimary }}>
                Kod al
              </button>
              {pairCode && (
                <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, letterSpacing: 1 }}>{pairCode}</span>
              )}
            </div>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Telefonda Cihaz bağla › Bunun yerine telefon numarasıyla bağla deyip bu kodu girin.
            </p>
          </details>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => run(() => whatsappApi.logout(org.organizationId))} disabled={busy} style={{ ...ghostButton, color: c.textSecondary }}>
              Vazgeç
            </button>
          </div>
        </>
      ) : status === "starting" ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>Bağlantı hazırlanıyor…</p>
      ) : (
        <>
          <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
            {status === "failed"
              ? "Bağlantı koptu. Numara telefonda hâlâ bağlı görünüyorsa önce oradan çıkarıp yeniden bağlayın."
              : "Bu iş için ayrılmış bir WhatsApp numarasını QR ile bağlayın; ekip üyeleri bildirimlerini bu numaradan alır."}
          </p>
          <button onClick={() => run(() => whatsappApi.start(org.organizationId))} disabled={busy} style={primaryButton}>
            {busy ? "Başlatılıyor…" : status === "failed" ? "Yeniden bağla" : "Numara bağla"}
          </button>
        </>
      )}

      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}

      {confirmLogout && (
        <ConfirmDialog
          title="WhatsApp bağlantısını kes"
          message="Numara Projelio'dan ayrılacak; ekip üyelerine WhatsApp bildirimi gitmeyecek. Mesaj geçmişi silinmez."
          confirmLabel="Bağlantıyı kes"
          onConfirm={async () => {
            setConfirmLogout(false);
            await run(() => whatsappApi.logout(org.organizationId));
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  );
}
