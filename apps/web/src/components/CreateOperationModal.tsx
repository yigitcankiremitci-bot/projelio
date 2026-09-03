import { useState } from "react";
import type { Operation, OperationBudgetPeriod } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { notifySidebarChanged } from "../lib/sidebarEvents";

interface Props {
  jobId: string;
  onClose: () => void;
  onCreated?: (operation: Operation) => void;
}

const periods: { value: OperationBudgetPeriod; label: string }[] = [
  { value: "weekly", label: "Haftalık" },
  { value: "monthly", label: "Aylık" },
  { value: "yearly", label: "Yıllık" },
];

export default function CreateOperationModal({ jobId, onClose, onCreated }: Props) {
  const c = useThemeColors();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [budgetPerPeriod, setBudgetPerPeriod] = useState("");
  const [budgetPeriod, setBudgetPeriod] = useState<OperationBudgetPeriod>("monthly");
  const [startedOn, setStartedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const created = await api.post<Operation>("/operations", {
        jobId,
        title,
        description: description || undefined,
        budgetPerPeriod: Number(budgetPerPeriod) || 0,
        budgetPeriod,
        startedOn: new Date(startedOn).toISOString(),
      });
      notifySidebarChanged();
      onClose();
      if (onCreated) onCreated(created);
      else window.location.reload();
    } catch {
      setError("Rutin oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Yeni rutin" onClose={onClose}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 14px", lineHeight: 1.5 }}>
        Rutin, bitiş tarihi olmayan ve tekrarlayan işlerden oluşan bir çalışmadır — sosyal medya
        yönetimi, aylık bakım, haftalık raporlama gibi. Bitişi olan işler için proje aç.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlık</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Sosyal medya yönetimi"
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

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 2 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Dönemsel ücret (₺)</label>
            <input
              type="number"
              min={0}
              value={budgetPerPeriod}
              onChange={(e) => setBudgetPerPeriod(e.target.value)}
              placeholder="0"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Dönem</label>
            <select
              value={budgetPeriod}
              onChange={(e) => setBudgetPeriod(e.target.value as OperationBudgetPeriod)}
              style={{ width: "100%" }}
            >
              {periods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <span style={{ fontSize: 13, color: c.textSecondary, marginTop: -6 }}>
          Rutinin sonu olmadığı için toplam bütçe yerine dönemsel çalışma ücreti tutulur.
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Başlangıç tarihi</label>
          <input
            type="date"
            value={startedOn}
            onChange={(e) => setStartedOn(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            background: c.primary,
            color: c.onPrimary,
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 17,
            fontWeight: 500,
          }}
        >
          {loading ? "Oluşturuluyor…" : "Rutin oluştur"}
        </button>
        <span style={{ fontSize: 13, color: c.textSecondary, textAlign: "center" }}>
          Sonraki adımda tekrar eden işleri (rutinleri) tanımlayacaksın.
        </span>
      </form>
    </Modal>
  );
}
