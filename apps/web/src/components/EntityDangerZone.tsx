import { useState } from "react";
import { colors } from "../theme/colors";
import ConfirmDialog from "./ConfirmDialog";
import { IconArchive, IconTrash } from "./icons";

interface Props {
  /** Türkçe -i hâli, örn. "İşi", "Projeyi", "Görevi", "Alt görevi", "Çıktıyı" */
  entityLabel: string;
  archiveMessage: string;
  deleteMessage: string;
  onArchive?: () => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function EntityDangerZone({ entityLabel, archiveMessage, deleteMessage, onArchive, onDelete }: Props) {
  const c = colors.light;
  const [confirming, setConfirming] = useState<"archive" | "delete" | null>(null);

  if (!onArchive && !onDelete) return null;

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
          onConfirm={onArchive}
        />
      )}
      {confirming === "delete" && onDelete && (
        <ConfirmDialog
          title={`${entityLabel} sil`}
          message={deleteMessage}
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirming(null)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}
