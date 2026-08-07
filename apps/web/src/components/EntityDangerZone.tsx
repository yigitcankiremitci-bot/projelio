import { useState } from "react";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { useUndo } from "../lib/undo";
import ConfirmDialog from "./ConfirmDialog";
import { IconArchive, IconTrash } from "./icons";

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
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function EntityDangerZone({
  entityLabel,
  archiveMessage,
  deleteMessage,
  resourcePath,
  onArchive,
  onDelete,
}: Props) {
  const c = colors.light;
  const { pushUndo, pushDestructive } = useUndo();
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

  if (!onArchive && !onDelete) return null;

  const handleArchive = async () => {
    await onArchive?.();
    if (!resourcePath) return;
    pushUndo({
      label: `${entityLabel} arşivleme`,
      run: () => api.patch(`${resourcePath}/restore`, {}),
      redo: () => api.patch(`${resourcePath}/archive`, {}),
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
      commit: () => api.delete(resourcePath),
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
          confirmLabel="Arşive ekle"
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
