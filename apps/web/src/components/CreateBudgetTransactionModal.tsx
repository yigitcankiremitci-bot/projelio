import { useState } from "react";
import type { BudgetTransaction, BudgetTransactionType } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  projectId: string;
  onClose: () => void;
  onCreated: (transaction: BudgetTransaction) => void;
}

export default function CreateBudgetTransactionModal({ projectId, onClose, onCreated }: Props) {
  const c = colors.light;
  const [type, setType] = useState<BudgetTransactionType>("expense");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Geçerli bir tutar gir.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const created = await api.post<BudgetTransaction>(`/projects/${projectId}/budget`, {
        type,
        amount: parsedAmount,
        description: description || undefined,
      });
      onCreated(created);
      onClose();
    } catch {
      setError(`${type === "income" ? "Gelir" : "Gider"} eklenemedi. Tekrar dene.`);
      setLoading(false);
    }
  };

  return (
    <Modal title="Gelir / Gider ekle" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setType("income")}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 8,
              border: `1px solid ${type === "income" ? c.success : c.border}`,
              background: type === "income" ? `${c.success}1a` : "transparent",
              color: type === "income" ? c.success : c.textSecondary,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            Gelir
          </button>
          <button
            type="button"
            onClick={() => setType("expense")}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 8,
              border: `1px solid ${type === "expense" ? c.danger : c.border}`,
              background: type === "expense" ? `${c.danger}1a` : "transparent",
              color: type === "expense" ? c.danger : c.textSecondary,
              fontSize: 16,
              fontWeight: 500,
            }}
          >
            Gider
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === "income" ? "Örn. Müşteri ön ödemesi" : "Örn. Ekipman kirası"}
            autoFocus
            style={{ width: "100%" }}
          />
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

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Ekleniyor…" : type === "income" ? "Geliri ekle" : "Gideri ekle"}
        </button>
      </form>
    </Modal>
  );
}
