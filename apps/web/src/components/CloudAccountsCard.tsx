import { useCallback, useEffect, useState } from "react";
import type { GoogleDriveStatus } from "@projelio/shared";
import { cloudStorageApi, driveApi, oneDriveApi, type CloudAccountRow } from "../api/files";
import { formatFileSize } from "../lib/driveLinks";
import { useThemeColors } from "../theme/useThemeColors";
import { notifyCloudStorageChanged, onCloudStorageChanged } from "../lib/cloudStorageEvents";
import ConfirmDialog from "./ConfirmDialog";
import { IconGoogleDrive, IconOneDrive } from "./icons";
import { useT } from "../lib/i18n";

/**
 * Ayarlar > Bağlı bulut hesapları.
 *
 * NEDEN TEK LİSTE: eskiden iki ayrı kart vardı (Google Drive / OneDrive) ve
 * ikisi de "kullanıcının TEK hesabı" varsayıyordu — biri bağlıysa diğeri
 * kilitleniyordu. Artık kullanıcı istediği kadar hesap bağlayabilir (kişisel
 * Drive + şirketin Drive'ı + OneDrive), hangisinin nerede kullanılacağını da
 * şirket ayarlarından seçer. O yüzden ekran "hangi sağlayıcı" değil "hangi
 * hesaplar" sorusunu yanıtlıyor.
 */
export default function CloudAccountsCard() {
  const c = useThemeColors();
  const t = useT();
  const [accounts, setAccounts] = useState<CloudAccountRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingDisconnect, setPendingDisconnect] = useState<CloudAccountRow | null>(null);
  // Kota yalnızca her sağlayıcının VARSAYILAN hesabı için biliniyor: /status
  // uçları o hesabı okuyor. Her hesap için ayrı ayrı sormak, Ayarlar açılışında
  // sağlayıcıya N istek demek olurdu.
  const [quotas, setQuotas] = useState<Partial<Record<"google" | "microsoft", GoogleDriveStatus>>>({});

  const load = useCallback(
    () =>
      cloudStorageApi
        .accounts()
        .then(setAccounts)
        .catch(() => setAccounts([])),
    []
  );

  const loadQuotas = useCallback(() => {
    void Promise.allSettled([
      driveApi.status().then((google) => setQuotas((prev) => ({ ...prev, google }))),
      oneDriveApi.status().then((microsoft) => setQuotas((prev) => ({ ...prev, microsoft }))),
    ]);
  }, []);

  useEffect(() => {
    void load();
    loadQuotas();
    return onCloudStorageChanged(() => {
      void load();
      loadQuotas();
    });
  }, [load, loadQuotas]);

  const handleConnect = async (provider: "google" | "microsoft") => {
    setBusy(true);
    setError("");
    try {
      // Ad isteğe bağlı: ilk hesapta gereksiz, ikinciden itibaren iki satırı
      // ayırt etmenin tek yolu.
      const label =
        (accounts?.some((a) => a.provider === provider)
          ? window.prompt(t("Bu hesaba bir ad verin (örn. Şirket Drive'ı):")) ?? ""
          : ""
        ).trim() || undefined;

      const api = provider === "google" ? driveApi : oneDriveApi;
      const { configured, url } = await api.connectUrl("/settings", label);
      if (!configured || !url) {
        setError(t("Bu sağlayıcı sunucuda yapılandırılmamış."));
        return;
      }
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı başlatılamadı."));
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (row: CloudAccountRow) => {
    setPendingDisconnect(null);
    setBusy(true);
    setError("");
    try {
      const api = row.provider === "google" ? driveApi : oneDriveApi;
      await api.disconnectAccount(row.id);
      await load();
      notifyCloudStorageChanged();
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı kaldırılamadı."));
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (row: CloudAccountRow) => {
    setRenaming(null);
    try {
      await cloudStorageApi.rename(row.provider, row.id, renameValue);
      await load();
    } catch (e: any) {
      setError(e?.message ?? t("Ad kaydedilemedi."));
    }
  };

  if (!accounts) return null;

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{t("Bulut depolama hesapları")}</div>
        <div style={{ fontSize: 14, color: c.textSecondary, lineHeight: 1.5 }}>
          {t(
            "Dosyalar kendi Drive/OneDrive hesabınızda saklanır. Birden fazla hesap bağlayıp şirketlerinizi ayrı hesaplarda tutabilirsiniz."
          )}
        </div>
      </div>

      {accounts.length === 0 && (
        <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 12px", lineHeight: 1.5 }}>
          {t("Dosya ekleyebilmek için önce bir bulut hesabı bağlayın.")}
        </p>
      )}

      {accounts.map((row) => {
        const status = quotas[row.provider];
        // Kota çubuğu yalnızca satır o sağlayıcının varsayılan hesabıysa gösterilir.
        const quota = status?.email === row.email ? status.quota : undefined;
        const ratio =
          quota?.usageBytes && quota?.limitBytes ? Math.min(quota.usageBytes / quota.limitBytes, 1) : null;

        return (
        <div
          key={`${row.provider}:${row.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 0",
            borderTop: `1px solid ${c.border}`,
          }}
        >
          {row.provider === "google" ? <IconGoogleDrive size={20} /> : <IconOneDrive size={20} />}

          <div style={{ flex: 1, minWidth: 0 }}>
            {renaming === row.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => void handleRename(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRename(row);
                  if (e.key === "Escape") setRenaming(null);
                }}
                placeholder={t("Örn. Şirket Drive'ı")}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 7,
                  border: `1px solid ${c.border}`,
                  background: c.background,
                  color: c.textPrimary,
                  fontSize: 15,
                }}
              />
            ) : (
              <>
                <div style={{ fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.label || row.email}
                </div>
                <div style={{ fontSize: 13, color: c.textSecondary }}>
                  {row.label ? `${row.email} · ` : ""}
                  {row.needsReconnect
                    ? t("erişim sona ermiş, yeniden bağlayın")
                    : row.driveReady
                    ? t("dosya erişimi hazır")
                    : t("yalnızca giriş için bağlı")}
                  {row.isLoginIdentity ? ` · ${t("giriş hesabı")}` : ""}
                </div>
                {ratio !== null && (
                  <div style={{ marginTop: 6, maxWidth: 260 }}>
                    <div style={{ height: 5, background: c.border, borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.round(ratio * 100)}%`,
                          height: "100%",
                          // Kota dolmaya yaklaşınca renk uyarır: yükleme sessizce
                          // başarısız olmadan önce kullanıcı görsün.
                          background: ratio > 0.9 ? c.danger : ratio > 0.75 ? c.warning : c.success,
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 4 }}>
                      {formatFileSize(quota?.usageBytes)} / {formatFileSize(quota?.limitBytes)}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <button
            onClick={() => {
              setRenameValue(row.label ?? "");
              setRenaming(row.id);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textSecondary,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("Ad ver")}
          </button>
          <button
            onClick={() => setPendingDisconnect(row)}
            disabled={busy}
            style={{
              padding: "6px 10px",
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.danger,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {t("Kaldır")}
          </button>
        </div>
        );
      })}

      <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <button
          onClick={() => void handleConnect("google")}
          disabled={busy}
          style={{
            padding: "9px 14px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 15,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {t("Google Drive hesabı bağla")}
        </button>
        <button
          onClick={() => void handleConnect("microsoft")}
          disabled={busy}
          style={{
            padding: "9px 14px",
            borderRadius: 9,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 15,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {t("OneDrive hesabı bağla")}
        </button>
      </div>

      {error && <p style={{ color: c.danger, fontSize: 15, margin: "10px 0 0" }}>{error}</p>}

      {pendingDisconnect && (
        <ConfirmDialog
          title={t("Bağlantıyı kaldır")}
          message={
            pendingDisconnect.isLoginIdentity
              ? t(
                  "Projelio'nun bu hesaptaki dosya erişimi kaldırılacak. Dosyalarınız yerinde kalır ama Projelio içinden açılamaz. Bu hesapla girişe devam edebilirsiniz."
                )
              : t(
                  "Bu hesabın bağlantısı tamamen kaldırılacak. Hesapta saklanan Projelio dosyası varsa önce ilgili şirket için başka bir depo hesabı seçmeniz gerekir."
                )
          }
          confirmLabel={t("Kaldır")}
          onConfirm={() => void handleDisconnect(pendingDisconnect)}
          onCancel={() => setPendingDisconnect(null)}
        />
      )}
    </div>
  );
}
