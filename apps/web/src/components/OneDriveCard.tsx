import { useEffect, useState } from "react";
import type { GoogleDriveStatus } from "@projelio/shared";
import { oneDriveApi } from "../api/files";
import { formatFileSize } from "../lib/driveLinks";
import { useThemeColors } from "../theme/useThemeColors";
import { notifyCloudStorageChanged, onCloudStorageChanged } from "../lib/cloudStorageEvents";
import ConfirmDialog from "./ConfirmDialog";
import { IconOneDrive } from "./icons";

/**
 * Ayarlar ekranındaki OneDrive bağlantı kartı.
 *
 * GoogleDriveCard.tsx'in birebir karşılığı — durum şekli aynı
 * (GoogleDriveStatus tipi iki sağlayıcı için de ortak), yalnızca uç
 * noktalar ve metinler OneDrive'a göre değişir.
 */
export default function OneDriveCard() {
  const c = useThemeColors();
  const [status, setStatus] = useState<GoogleDriveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = () => oneDriveApi.status().then(setStatus).catch(() => setStatus(null));

  useEffect(() => {
    void load();
    // Google Drive kartında bağlantı kurulur/kaldırılırsa bu kartın kilitli
    // durumu da anında güncellensin.
    return onCloudStorageChanged(() => void load());
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    setError("");
    try {
      const { configured, url, blockedBy } = await oneDriveApi.connectUrl("/settings");
      if (blockedBy) {
        setError("Zaten Google Drive bağlısınız. Değiştirmek için önce Drive bağlantısını kaldırın.");
        return;
      }
      if (!configured || !url) {
        setError("OneDrive entegrasyonu sunucuda yapılandırılmamış.");
        return;
      }
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message ?? "Bağlantı başlatılamadı.");
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    setBusy(true);
    try {
      await oneDriveApi.disconnect();
      await load();
      notifyCloudStorageChanged();
    } catch (e: any) {
      setError(e?.message ?? "Bağlantı kaldırılamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  const quotaUsed = status.quota?.usageBytes;
  const quotaLimit = status.quota?.limitBytes;
  const quotaRatio = quotaUsed && quotaLimit ? Math.min(quotaUsed / quotaLimit, 1) : null;

  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: "18px 20px",
        marginTop: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <IconOneDrive size={22} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>OneDrive</div>
          <div style={{ fontSize: 14, color: c.textSecondary }}>
            Proje dosyaları kendi OneDrive'ınızda saklanır
          </div>
        </div>
      </div>

      {!status.configured ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 4px" }}>
          Bu özellik sunucuda henüz yapılandırılmamış.
        </p>
      ) : status.driveReady ? (
        <>
          <div style={{ fontSize: 15, color: c.textPrimary, marginBottom: 4 }}>
            Bağlı: <strong style={{ fontWeight: 500 }}>{status.email}</strong>
          </div>

          {quotaRatio !== null && (
            <div style={{ margin: "10px 0 14px" }}>
              <div style={{ height: 6, background: c.border, borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round(quotaRatio * 100)}%`,
                    height: "100%",
                    // Kota dolmaya yaklaşınca renk uyarır: yükleme sessizce
                    // başarısız olmadan önce kullanıcı görsün.
                    background: quotaRatio > 0.9 ? c.danger : quotaRatio > 0.75 ? c.warning : c.success,
                  }}
                />
              </div>
              <div style={{ fontSize: 14, color: c.textSecondary, marginTop: 6 }}>
                {formatFileSize(quotaUsed)} / {formatFileSize(quotaLimit)} kullanılıyor
              </div>
            </div>
          )}

          <button
            onClick={() => setConfirmDisconnect(true)}
            disabled={busy}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.danger,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Bağlantıyı kaldır
          </button>
        </>
      ) : status.lockedByOtherProvider ? (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
          Depolama için şu an Google Drive kullanılıyor. Değiştirmek için önce Drive kartından bağlantıyı kaldırın.
        </p>
      ) : (
        <>
          <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
            {status.needsReconnect
              ? "OneDrive erişiminiz sona ermiş. Dosyalarınıza erişmeye devam etmek için yeniden bağlanın."
              : "Projelere, görevlere ve çıktılara dosya ekleyebilmek için OneDrive hesabınızı bağlayın."}
          </p>
          <button
            onClick={handleConnect}
            disabled={busy}
            style={{
              padding: "9px 16px",
              borderRadius: 9,
              border: "none",
              background: c.primary,
              color: "#fff",
              fontSize: 15,
              fontWeight: 500,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Yönlendiriliyor…" : status.needsReconnect ? "Yeniden bağlan" : "OneDrive'ı bağla"}
          </button>
        </>
      )}

      {error && <p style={{ color: c.danger, fontSize: 15, margin: "10px 0 0" }}>{error}</p>}

      {confirmDisconnect && (
        <ConfirmDialog
          title="OneDrive bağlantısını kaldır"
          message="Projelio'nun OneDrive erişimi kaldırılacak. Dosyalarınız OneDrive'da kalır ama Projelio içinden açılamaz."
          confirmLabel="Kaldır"
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
    </div>
  );
}
