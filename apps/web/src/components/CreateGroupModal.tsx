import { useState } from "react";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { useT } from "../lib/i18n";

interface Props {
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateGroupModal({ onClose, onCreated }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/groups", { name, description: description || undefined });
      notifySidebarChanged();
      onClose();
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError(t("Grup oluşturulamadı. Tekrar dene."));
      setLoading(false);
    }
  };

  return (
    <Modal title="Yeni grup (holding)" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Ad")}</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder={t("Örn. Acme Holding")} style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Açıklama")}</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Kısa açıklama (opsiyonel)")} style={{ width: "100%" }} />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Oluşturuluyor…" : "Grup oluştur"}
        </button>
      </form>
    </Modal>
  );
}
