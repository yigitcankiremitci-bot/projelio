import { useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Sil",
  cancelLabel = "Vazgeç",
  danger = true,
  onConfirm,
  onCancel,
}: Props) {
  const c = useThemeColors();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConfirm = async () => {
    setError("");
    setLoading(true);
    try {
      await onConfirm();
    } catch {
      setError("İşlem gerçekleştirilemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title={title} onClose={onCancel} maxWidth={380}>
      <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>{message}</p>

      {error && <p style={{ color: c.danger, fontSize: 16, margin: "0 0 12px" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          onClick={onCancel}
          disabled={loading}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 16,
          }}
        >
          {cancelLabel}
        </button>
        <button
          // Enter bu butona basar (bkz. Modal). Silme onayı da dahil: kullanıcı
          // pencereyi okuyup zaten bilerek açtı, ikinci onay için fare aramasın.
          data-primary
          onClick={handleConfirm}
          disabled={loading}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: "none",
            background: danger ? c.danger : c.primary,
            color: "#fff",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          {loading ? "Siliniyor…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
