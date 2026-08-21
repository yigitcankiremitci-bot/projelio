import { useEffect, useState } from "react";
import type { Project, RecurrenceInterval, RecurringPayment } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  // Verilirse düzenleme modunda açılır.
  payment?: RecurringPayment;
  onClose: () => void;
  onSaved: () => void;
}

const intervalOptions: { value: RecurrenceInterval; label: string }[] = [
  { value: "weekly", label: "Her hafta" },
  { value: "monthly", label: "Her ay" },
  { value: "yearly", label: "Her yıl" },
];

const reminderOptions = [
  { value: 0, label: "Hatırlatma yok" },
  { value: 1, label: "1 gün önce" },
  { value: 3, label: "3 gün önce" },
  { value: 7, label: "1 hafta önce" },
];

function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AddRecurringPaymentModal({ payment, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const [type, setType] = useState<"income" | "expense">(payment?.type ?? "expense");
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const [description, setDescription] = useState(payment?.description ?? "");
  const [interval, setInterval] = useState<RecurrenceInterval>(payment?.interval ?? "monthly");
  const [nextDueDate, setNextDueDate] = useState(payment?.nextDueDate ?? todayString());
  const [reminderDaysBefore, setReminderDaysBefore] = useState(payment?.reminderDaysBefore ?? 1);
  const [projectId, setProjectId] = useState(payment?.projectId ?? "");
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
    const body = {
      type,
      amount: Number(amount) || 0,
      description: description || undefined,
      interval,
      nextDueDate,
      reminderDaysBefore,
      projectId: projectId || undefined,
    };
    try {
      if (payment) await api.patch(`/budget/recurring/${payment.id}`, body);
      else await api.post("/budget/recurring", body);
      onSaved();
      onClose();
    } catch {
      setError("Kaydedilemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title={payment ? "Düzenli ödemeyi düzenle" : "Düzenli ödeme ekle"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Tür</label>
          <select value={type} onChange={(e) => setType(e.target.value as "income" | "expense")} style={{ width: "100%" }}>
            <option value="expense">Gider (kira, abonelik…)</option>
            <option value="income">Gelir (düzenli tahsilat…)</option>
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

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Tekrar</label>
            <select
              value={interval}
              onChange={(e) => setInterval(e.target.value as RecurrenceInterval)}
              style={{ width: "100%" }}
            >
              {intervalOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>İlk ödeme</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Hatırlatıcı</label>
          <select
            value={reminderDaysBefore}
            onChange={(e) => setReminderDaysBefore(Number(e.target.value))}
            style={{ width: "100%" }}
          >
            {reminderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            Vadesi gelince tutar bütçene otomatik işlenir ve bildirim gönderilir.
          </span>
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
