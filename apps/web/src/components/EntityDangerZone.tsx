import { useState } from "react";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useUndo } from "../lib/undo";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import ConfirmDialog from "./ConfirmDialog";
import { IconArchive, IconTrash } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  /** Türkçe -i hâli, örn. "İşi", "Projeyi", "Görevi", "Alt görevi", "Çıktıyı" */
  entityLabel: string;
  archiveMessage: string;
  deleteMessage: string;
  /**
   * Kaydın REST yolu, örn. "/jobs/abc123". Verilirse bu bileşen geri alma
   * (Cmd/Ctrl+Z) davranışını üstlenir:
   *
   *  - Arşivleme: onArchive tamamlandıktan sonra yığına `PATCH {path}/restore`
   *    çağrısı eklenir.
   *  - Silme: DELETE isteğini ARTIK BU BİLEŞEN atar ve birkaç saniye geciktirir
   *    (bkz. lib/undo.tsx pushDestructive). Bu durumda onDelete artık silme
   *    işlemini değil, silme SONRASI arayüz davranışını (listeyi tazele, geri
   *    git…) temsil eder — kendi içinde api.delete çağırmamalıdır.
   *
   * Verilmezse eski davranış aynen korunur: onArchive/onDelete her şeyi kendi yapar.
   */
  resourcePath?: string;
  /**
   * Bu kayıt sidebar'daki gezinme ağacında görünüyorsa (organizasyon, grup, iş,
   * proje, departman) true ver: arşivleme/silme ve bunların geri alınması
   * ağacın tazelenmesini tetikler (bkz. lib/sidebarEvents.ts). Görev, çıktı,
   * ürün gibi ağaçta yeri olmayan kayıtlarda BOŞ BIRAK — her arşivlemede
   * sidebar'ın onlarca isteğini yeniden atmanın anlamı yok.
   */
  affectsSidebar?: boolean;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function EntityDangerZone({
  entityLabel,
  archiveMessage,
  deleteMessage,
  resourcePath,
  affectsSidebar,
  onArchive,
  onDelete,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const { pushUndo, pushDestructive } = useUndo();
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

  if (!onArchive && !onDelete) return null;

  const handleArchive = async () => {
    await onArchive?.();
    if (affectsSidebar) notifySidebarChanged();
    if (!resourcePath) return;
    pushUndo({
      label: `${entityLabel} arşivleme`,
      run: async () => {
        await api.patch(`${resourcePath}/restore`, {});
        if (affectsSidebar) notifySidebarChanged();
      },
      redo: async () => {
        await api.patch(`${resourcePath}/archive`, {});
        if (affectsSidebar) notifySidebarChanged();
      },
    });
  };

  const handleDelete = async () => {
    if (!resourcePath) {
      await onDelete?.();
      return;
    }
    // Kalıcı silme sunucuda geri alınamadığı için istek hemen atılmaz: arayüz
    // silinmiş gibi davranır, gerçek DELETE birkaç saniye sonra gider. Bu
    // pencerede Cmd+Z basılırsa istek hiç gönderilmez.
    pushDestructive({
      label: `${entityLabel} silme`,
      // Sidebar haberi DELETE gittikten SONRA verilir: geri alma penceresi
      // boyunca kayıt sunucuda hâlâ duruyor, erken tazeleme onu geri getirirdi.
      commit: async () => {
        await api.delete(resourcePath);
        if (affectsSidebar) notifySidebarChanged();
      },
      restore: () => {},
      // Sunucu kaydı hâlâ döndüreceği için listeler bu id'yi elemeli
      // (bkz. useWithoutPendingDeletes).
      entityId: resourcePath.split("/").pop(),
    });
    await onDelete?.();
  };

  return (
    <div style={{ borderTop: `1px solid ${c.border}`, marginTop: 18, paddingTop: 14, display: "flex", gap: 20, flexWrap: "wrap" }}>
      {onArchive && (
        <button
          type="button"
          onClick={() => setConfirming("archive")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: c.textSecondary, fontSize: 16, padding: 0 }}
        >
          <IconArchive size={14} color={c.textSecondary} />
          {entityLabel} arşive ekle
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={() => setConfirming("delete")}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: c.danger, fontSize: 16, padding: 0 }}
        >
          <IconTrash size={14} color={c.danger} />
          {entityLabel} sil
        </button>
      )}

      {confirming === "archive" && onArchive && (
        <ConfirmDialog
          title={`${entityLabel} arşive ekle`}
          message={archiveMessage}
          confirmLabel={t("Arşive ekle")}
          danger={false}
          onCancel={() => setConfirming(null)}
          onConfirm={handleArchive}
        />
      )}
      {confirming === "delete" && onDelete && (
        <ConfirmDialog
          title={`${entityLabel} sil`}
          message={deleteMessage}
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
