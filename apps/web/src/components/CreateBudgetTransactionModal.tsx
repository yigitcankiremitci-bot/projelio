import { useState } from "react";
import type { BudgetTransaction, BudgetTransactionType } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  projectId: string;
  /** Verilirse form düzenleme kipinde açılır; yoksa yeni kayıt eklenir. */
  transaction?: BudgetTransaction;
  onClose: () => void;
  onSaved: (transaction: BudgetTransaction) => void;
}

export default function CreateBudgetTransactionModal({ projectId, transaction, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const editing = Boolean(transaction);
  const [type, setType] = useState<BudgetTransactionType>(transaction?.type ?? "expense");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
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
      // Düzenleme, kaydın hangi deftere ait olduğundan bağımsız tek uçtan gider;
      // yetki kontrolü sunucuda kaydın bağlamına bakılarak yapılır.
      const payload = { type, amount: parsedAmount, description: description || undefined };
      const saved = transaction
        ? await api.patch<BudgetTransaction>(`/budget/transactions/${transaction.id}`, payload)
        : await api.post<BudgetTransaction>(`/projects/${projectId}/budget`, payload);
      onSaved(saved);
      onClose();
    } catch {
      setError(
        editing
          ? "Kayıt güncellenemedi. Tekrar dene."
          : `${type === "income" ? "Ödeme" : "Gider"} eklenemedi. Tekrar dene.`
      );
      setLoading(false);
    }
  };

  return (
    <Modal title={editing ? "Kaydı düzenle" : "Ödeme / gider ekle"} onClose={onClose}>
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
            {t("Gelen ödeme")}
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
            {t("Gider")}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Açıklama")}</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={type === "income" ? "Örn. Müşteri ön ödemesi" : "Örn. Ekipman kirası"}
            autoFocus
            style={{ width: "100%" }}
          />
          {type === "income" && (
            <span style={{ fontSize: 13, color: c.textSecondary }}>
              {t("Müşteriden tahsil ettiğin tutar — beklenen ödemeden düşülür.")}
            </span>
          )}
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
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading
            ? editing
              ? "Kaydediliyor…"
              : "Ekleniyor…"
            : editing
              ? "Kaydet"
              : type === "income"
                ? "Ödemeyi ekle"
                : "Gideri ekle"}
        </button>
      </form>
    </Modal>
  );
}
