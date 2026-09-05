import { useEffect, useState } from "react";
import type { BudgetTransaction, BudgetTransactionType, Project } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  /** Verilirse form düzenleme kipinde açılır; yoksa yeni kayıt eklenir. */
  transaction?: BudgetTransaction;
  onClose: () => void;
  /** Kaydedilen kayıt geri verilir: çağıran bunu geri alma yığınına koyabilsin. */
  onSaved: (saved: BudgetTransaction) => void;
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

export default function AddBudgetEntryModal({ transaction, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const editing = Boolean(transaction);
  const [type, setType] = useState<BudgetTransactionType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [projectId, setProjectId] = useState(transaction?.projectId ?? "");
  const [occurredAt, setOccurredAt] = useState(transaction?.occurredAt?.slice(0, 10) ?? todayString());
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
      const payload = {
        type,
        amount: Number(amount) || 0,
        // Düzenlemede boş açıklama/proje "temizle" anlamına gelmeli; bu yüzden
        // undefined değil, boş değer gönderiliyor.
        description: editing ? description : description || undefined,
        projectId: editing ? projectId || null : projectId || undefined,
        occurredAt,
      };
      const saved = transaction
        ? await api.patch<BudgetTransaction>(`/budget/transactions/${transaction.id}`, payload)
        : await api.post<BudgetTransaction>("/budget/transactions", payload);
      onSaved(saved);
      onClose();
    } catch {
      setError(editing ? "Kayıt güncellenemedi. Tekrar dene." : "Kayıt eklenemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title={editing ? "Kaydı düzenle" : "Gelir / gider ekle"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Tür")}</label>
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
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Açıklama")}</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("Örn. Ofis kirası")}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Proje (opsiyonel)</label>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: "100%" }}>
            <option value="">{t("Projesiz — genel kayıt")}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {type === "income" && projectId && (
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {t("Bu tutar projenin beklenen ödemesinden düşülür.")}
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Tarih")}</label>
          <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required style={{ width: "100%" }} />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </form>
    </Modal>
  );
}
