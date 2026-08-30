import { useState } from "react";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  // İkisinden biri verilmeli.
  projectId?: string;
  departmentId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateOutputModal({ projectId, departmentId, onClose, onCreated }: Props) {
  const c = useThemeColors();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = departmentId ? `/departments/${departmentId}/outputs` : `/projects/${projectId}/outputs`;
      await api.post(path, { title, description: description || undefined });
      onCreated();
      onClose();
    } catch {
      setError("Çıktı oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Yeni çıktı" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            placeholder="Örn. Master dosyası"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
            style={{ width: "100%" }}
          />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Oluşturuluyor…" : "Çıktı oluştur"}
        </button>
      </form>
    </Modal>
  );
}
