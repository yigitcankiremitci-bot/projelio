import { useState } from "react";
import type { Project } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  project: Project;
  onClose: () => void;
  onSaved: (updated: Project) => void;
}

function toDateInputValue(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

export default function ExtendDeadlineModal({ project, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const [deadline, setDeadline] = useState(toDateInputValue(project.deadline));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newDeadline = new Date(deadline);
    if (newDeadline.getTime() < new Date(project.startDate).getTime()) {
      setError("Bitiş tarihi başlangıç tarihinden önce olamaz.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const updated = await api.patch<Project>(`/projects/${project.id}`, {
        deadline: newDeadline.toISOString(),
      });
      onSaved(updated);
    } catch {
      setError("Deadline güncellenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Deadline'ı değiştir" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>
          Mevcut bitiş tarihi: <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{new Date(project.deadline).toLocaleDateString("tr-TR")}</strong>
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Yeni bitiş tarihi</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            required
            autoFocus
            style={{ width: "100%" }}
          />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Deadline'ı güncelle"}
        </button>
      </form>
    </Modal>
  );
}
