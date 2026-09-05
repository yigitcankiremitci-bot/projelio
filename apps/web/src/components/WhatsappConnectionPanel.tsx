import { useEffect, useState } from "react";
import type { WhatsappConnectionSummary } from "@projelio/shared";
import { whatsappApi } from "../api/whatsapp";
import { useThemeColors } from "../theme/useThemeColors";
import ConfirmDialog from "./ConfirmDialog";
import { useT } from "../lib/i18n";

/** QR görselinin tazelenme aralığı; WhatsApp QR'ı ~20 sn'de bir değiştirir. */
const QR_REFRESH_MS = 15_000;

/**
 * Havuzdaki tek bir numaranın yönetici paneli: QR (ya da eşleştirme kodu) →
 * bağlı → kopar / havuzdan çıkar. Kopan bağlantı kendiliğinden yeniden
 * BAŞLATILMAZ: düğme insan kararı ister (bağlan/kop döngüsü ban tetikleyicisi).
 */
export default function WhatsappConnectionPanel({
  number,
  onChanged,
}: {
  number: WhatsappConnectionSummary;
  onChanged: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [pairPhone, setPairPhone] = useState("");
  const [pairCode, setPairCode] = useState("");
  const [confirm, setConfirm] = useState<"logout" | "remove" | null>(null);

  const status = number.status;

  // QR yalnızca beklenirken çekilir; bağlanınca durur.
  useEffect(() => {
    if (status !== "scan_qr") {
      setQr(null);
      return;
    }
    let cancelled = false;
    const fetchQr = () =>
      whatsappApi.admin
        .qr(number.id)
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
  }, [status, number.id]);

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

  const paused = number.pausedUntil && new Date(number.pausedUntil) > new Date();

  return (
    <div style={{ padding: "14px 16px", border: `1px solid ${c.border}`, borderRadius: 10, background: c.background }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <div style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary }}>{number.label}</div>
        <div style={{ fontSize: 14, color: status === "working" ? c.success : status === "failed" ? c.danger : c.textSecondary }}>
          {status === "working" ? "bağlı" : status === "scan_qr" ? "QR bekliyor" : status === "starting" ? "hazırlanıyor" : status === "failed" ? "koptu" : "durduruldu"}
        </div>
        {number.phoneMasked && <div style={{ fontSize: 14, color: c.textSecondary }}>{number.phoneMasked}</div>}
        <div style={{ fontSize: 14, color: c.textSecondary, marginLeft: "auto" }}>{number.assignedUsers ?? 0} kullanıcı</div>
      </div>

      {paused && (
        <p style={{ fontSize: 14, color: c.warning, margin: "0 0 8px", lineHeight: 1.5 }}>
          WhatsApp gönderimi kısıtladı; {new Date(number.pausedUntil!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}'e kadar kuyrukta.
          {number.pauseReason ? ` (${number.pauseReason})` : ""}
        </p>
      )}

      {status === "scan_qr" && (
        <>
          <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 10px", lineHeight: 1.5 }}>
            {t("Numaranın telefonunda WhatsApp › Bağlı cihazlar › Cihaz bağla ile bu kodu okutun. Kod kendiliğinden yenilenir.")}
          </p>
          {qr ? (
            <img src={qr} alt="WhatsApp QR" width={220} height={220} style={{ display: "block", borderRadius: 8, background: "#fff" }} />
          ) : (
            <div style={{ width: 220, height: 220, borderRadius: 8, background: c.border }} />
          )}
          <details style={{ marginTop: 10, fontSize: 14, color: c.textSecondary }}>
            <summary style={{ cursor: "pointer" }}>{t("QR okutamıyorum, kodla bağlanayım")}</summary>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={pairPhone}
                onChange={(e) => setPairPhone(e.target.value)}
                placeholder="+90 5xx xxx xx xx"
                style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary, fontSize: 15 }}
              />
              <button
                onClick={() => run(async () => setPairCode((await whatsappApi.admin.pairingCode(number.id, pairPhone)).code))}
                disabled={busy || !pairPhone.trim()}
                style={{ ...ghostButton, color: c.textPrimary }}
              >
                {t("Kod al")}
              </button>
              {pairCode && <span style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, letterSpacing: 1 }}>{pairCode}</span>}
            </div>
          </details>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {(status === "stopped" || status === "failed") && (
          <button onClick={() => run(() => whatsappApi.admin.start(number.id))} disabled={busy} style={primaryButton}>
            {status === "failed" ? "Yeniden bağla" : "Bağla"}
          </button>
        )}
        {(status === "working" || status === "scan_qr" || status === "starting") && (
          <button onClick={() => setConfirm("logout")} disabled={busy} style={{ ...ghostButton, color: c.danger }}>
            {status === "working" ? "Bağlantıyı kes" : "Vazgeç"}
          </button>
        )}
        <button onClick={() => setConfirm("remove")} disabled={busy} style={{ ...ghostButton, color: c.textSecondary }}>
          {t("Havuzdan çıkar")}
        </button>
      </div>

      {error && <p style={{ fontSize: 14, color: c.danger, margin: "8px 0 0" }}>{error}</p>}

      {confirm === "logout" && (
        <ConfirmDialog
          title={t("WhatsApp bağlantısını kes")}
          message="Numara Projelio'dan ayrılacak; bu numaraya atanmış kullanıcılara bildirim gitmeyecek ve Lio bu numaradan yazamayacak. Kayıtlar ve atamalar silinmez, yeniden bağlanabilir."
          confirmLabel={t("Bağlantıyı kes")}
          onConfirm={async () => {
            setConfirm(null);
            await run(() => whatsappApi.admin.logout(number.id));
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "remove" && (
        <ConfirmDialog
          title={t("Numarayı havuzdan çıkar")}
          message="Bu numaraya atanmış kullanıcılar başka bir bağlı numaraya taşınır; müşterileri artık farklı bir numaradan mesaj görür. Başka bağlı numara yoksa işlem reddedilir."
          confirmLabel={t("Havuzdan çıkar")}
          onConfirm={async () => {
            setConfirm(null);
            await run(() => whatsappApi.admin.remove(number.id));
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
