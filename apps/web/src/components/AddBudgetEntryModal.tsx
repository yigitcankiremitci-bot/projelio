import { useEffect, useState } from "react";
import type { BudgetTransactionType, Project } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

const typeOptions: { value: BudgetTransactionType; label: string }[] = [
  { value: "income", label: "Gelen ödeme (müşteriden tahsilat)" },
  { value: "expense", label: "Gider (malzeme, abonelik…)" },
  { value: "payout", label: "Hakediş ödemesi (taşeron/ekip)" },
];

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AddBudgetEntryModal({ onClose, onSaved }: Props) {
  const c = colors.light;
  const [type, setType] = useState<BudgetTransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [occurredAt, setOccurredAt] = useState(todayString());
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/budget/transactions", {
        type,
        amount: Number(amount) || 0,
        description: description || undefined,
        projectId: projectId || undefined,
        occurredAt,
      });
      onSaved();
      onClose();
    } catch {
      setError("Kayıt eklenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Gelir / gider ekle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Tür</label>
          <select value={type} onChange={(e) => setType(e.target.value as BudgetTransactionType)} style={{ width: "100%" }}>
            {typeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Tutar (₺)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Örn. Ofis kirası"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Proje (opsiyonel)</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: "100%" }}>
            <option value="">Projesiz — genel kayıt</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {type === "income" && projectId && (
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              Bu tutar projenin beklenen ödemesinden düşülür.
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Tarih</label>
          <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required style={{ width: "100%" }} />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>
    </Modal>
  );
}
