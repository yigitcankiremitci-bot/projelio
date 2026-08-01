import { useState } from "react";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  jobId: string;
  onClose: () => void;
  onCreated?: () => void;
}

export default function CreateProjectModal({ jobId, onClose, onCreated }: Props) {
  const c = colors.light;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [totalBudget, setTotalBudget] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/projects", {
        jobId,
        title,
        description: description || undefined,
        totalBudget: Number(totalBudget) || 0,
        startDate: startDate ? new Date(startDate).toISOString() : new Date().toISOString(),
        deadline: deadline ? new Date(deadline).toISOString() : new Date().toISOString(),
        status: "active",
      });
      onClose();
      if (onCreated) onCreated();
      else window.location.reload();
    } catch {
      setError("Proje oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Yeni proje" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Marka yenileme" style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kısa açıklama (opsiyonel)" style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Anlaşılan ücret (₺)</label>
          <input type="number" min={0} value={totalBudget} onChange={(e) => setTotalBudget(e.target.value)} placeholder="0" style={{ width: "100%" }} />
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            Müşteriden tahsil edeceğin toplam tutar. Aldığın ödemeler bundan düşülür.
          </span>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Başlangıç tarihi</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bitiş tarihi</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
          </div>
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Oluşturuluyor…" : "Proje oluştur"}
        </button>
      </form>
    </Modal>
  );
}
