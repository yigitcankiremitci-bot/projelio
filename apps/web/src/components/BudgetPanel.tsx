import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BudgetOverview, BudgetTransaction, RecurringPayment } from "@projelio/shared";
import { api } from "../api/client";
import { useRefreshOnUndo } from "../lib/undo";
import { useThemeColors } from "../theme/useThemeColors";
import AddBudgetEntryModal from "./AddBudgetEntryModal";
import AddRecurringPaymentModal from "./AddRecurringPaymentModal";
import { useUndo } from "../lib/undo";
import { IconPlus, IconTrash, IconEdit, IconCalendar, IconFolder } from "./icons";

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

const intervalLabels: Record<string, string> = {
  weekly: "Her hafta",
  monthly: "Her ay",
  yearly: "Her yıl",
};

const typeLabels: Record<string, string> = {
  income: "Gelen ödeme",
  expense: "Gider",
  payout: "Hakediş ödemesi",
};

export default function BudgetPanel() {
  const c = useThemeColors();
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  const [addingEntry, setAddingEntry] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [addingRecurring, setAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringPayment | null>(null);
  const { pushUndo, pushDestructive } = useUndo();

  const reload = () => {
    api.get<BudgetOverview>("/budget/overview").then(setOverview).catch(() => setOverview(null));
    api.get<BudgetTransaction[]>("/budget/transactions").then(setTransactions).catch(() => setTransactions([]));
    api.get<RecurringPayment[]>("/budget/recurring").then(setRecurring).catch(() => setRecurring([]));
  };

  useEffect(reload, []);
  // Aynı sayfadaki başka biri değiştirdiğinde de tazelenir (bkz. lib/liveRoom.ts).
  useRefreshOnUndo(reload);

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const deleteTransaction = async (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    pushDestructive({
      label: "Kayıt silme",
      commit: async () => {
        await api.delete(`/budget/transactions/${id}`).catch(() => {});
        reload();
      },
      restore: reload,
    });
  };

  // Bir kaydın alanlarını sunucuda o hâle getirir; geri ve ileri alma aynı işlemi
  // farklı değerlerle çağırır.
  const applyValues = async (tx: BudgetTransaction) => {
    await api
      .patch(`/budget/transactions/${tx.id}`, {
        type: tx.type,
        amount: tx.amount,
        description: tx.description ?? "",
        projectId: tx.projectId ?? null,
        occurredAt: tx.occurredAt,
      })
      .catch(() => {});
    reload();
  };

  // Ekleme ve düzenleme de geri alınabilir: bütçe girerken en sık yapılan hata
  // yanlış tutar yazmak ve Cmd/Ctrl+Z burada hiç çalışmıyordu.
  const handleEntrySaved = (saved: BudgetTransaction, previous: BudgetTransaction | null) => {
    reload();
    if (previous) {
      pushUndo({
        label: "Bütçe kaydı düzenlendi",
        run: () => applyValues(previous),
        redo: () => applyValues(saved),
      });
      return;
    }
    const payload = {
      type: saved.type,
      amount: saved.amount,
      description: saved.description,
      projectId: saved.projectId,
      occurredAt: saved.occurredAt,
    };
    pushUndo({
      label: "Bütçe kaydı eklendi",
      run: async () => {
        await api.delete(`/budget/transactions/${saved.id}`).catch(() => {});
        reload();
      },
      redo: async () => {
        await api.post("/budget/transactions", payload);
        reload();
      },
    });
  };

  const deleteRecurring = async (id: string) => {
    setRecurring((prev) => prev.filter((r) => r.id !== id));
    pushDestructive({
      label: "Düzenli ödeme silme",
      commit: async () => {
        await api.delete(`/budget/recurring/${id}`).catch(() => {});
        reload();
      },
      restore: reload,
    });
  };

  const toggleRecurring = async (payment: RecurringPayment) => {
    await api.patch(`/budget/recurring/${payment.id}`, { active: !payment.active });
    reload();
  };

  const cardStyle = {
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    padding: 16,
  } as const;

  const sectionTitle = {
    fontSize: 18,
    fontWeight: 500,
    color: c.textPrimary,
    margin: "0 0 14px",
  } as const;

  const addButton = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    fontWeight: 500,
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Özet kartları — "gelen" ve "beklenen" ayrı ayrı; tahsil edilen para
          anlaşılan ücretin içinden düşer, üstüne eklenmez. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        <SummaryCard label="Anlaşılan ücret" value={overview?.totalAgreedFee ?? 0} color={c.textPrimary} />
        <SummaryCard label="Gelen ödeme" value={overview?.totalReceived ?? 0} color={c.success} />
        <SummaryCard label="Beklenen ödeme" value={overview?.totalExpected ?? 0} color={c.warning} />
        <SummaryCard label="Gider" value={overview?.totalExpense ?? 0} color={c.danger} />
        <SummaryCard
          label="Net kazanç"
          value={overview?.netEarned ?? 0}
          color={(overview?.netEarned ?? 0) < 0 ? c.danger : c.success}
          hint="Gelen ödeme − gider"
        />
      </div>

      {/* Proje bazlı tahsilat durumu */}
      <section>
        <h2 style={sectionTitle}>Projelere göre tahsilat</h2>
        {!overview || overview.projects.length === 0 ? (
          <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 15, padding: 28 }}>
            Henüz bütçesi olan bir projen yok.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {overview.projects.map((p) => {
              const progress = p.agreedFee > 0 ? Math.min(100, (p.received / p.agreedFee) * 100) : 0;
              return (
                <Link key={p.projectId} to={`/projects/${p.projectId}`} style={{ ...cardStyle, display: "block" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <IconFolder size={15} color={c.textSecondary} />
                    <span style={{ flex: 1, minWidth: 140, fontSize: 15, fontWeight: 500, color: c.textPrimary }}>
                      {p.projectTitle}
                    </span>
                    {p.fullyCollected ? (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: c.success,
                          background: `${c.success}1a`,
                          padding: "2px 9px",
                          borderRadius: 999,
                        }}
                      >
                        Tahsilat tamam
                        {p.overpaid > 0 && ` · +${formatMoney(p.overpaid)} fazla`}
                      </span>
                    ) : (
                      <span style={{ fontSize: 14, color: c.textSecondary }}>
                        {formatMoney(p.agreedFee)} anlaşıldı
                      </span>
                    )}
                  </div>

                  {/* Tahsilat ilerlemesi */}
                  <div style={{ height: 6, borderRadius: 999, background: c.background, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: c.success }} />
                  </div>

                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
                    <span style={{ color: c.textSecondary }}>
                      Gelen <strong style={{ color: c.success, fontWeight: 500 }}>{formatMoney(p.received)}</strong>
                    </span>
                    <span style={{ color: c.textSecondary }}>
                      Beklenen{" "}
                      <strong style={{ color: p.expected > 0 ? c.warning : c.textSecondary, fontWeight: 500 }}>
                        {formatMoney(p.expected)}
                      </strong>
                    </span>
                    {p.expense > 0 && (
                      <span style={{ color: c.textSecondary }}>
                        Gider <strong style={{ color: c.danger, fontWeight: 500 }}>{formatMoney(p.expense)}</strong>
                      </span>
                    )}
                    <span style={{ color: c.textSecondary }}>
                      Net{" "}
                      <strong style={{ color: p.netEarned < 0 ? c.danger : c.textPrimary, fontWeight: 500 }}>
                        {formatMoney(p.netEarned)}
                      </strong>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Düzenli ödemeler */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Düzenli ödemeler</h2>
          <button type="button" onClick={() => setAddingRecurring(true)} style={addButton}>
            <IconPlus size={14} color={c.textSecondary} />
            Ekle
          </button>
        </div>

        {recurring.length === 0 ? (
          <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 15, padding: 28 }}>
            Kira, abonelik gibi tekrar eden ödemeleri buraya ekle. Vadesi gelince bütçene otomatik işlenir ve bildirim
            gönderilir.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recurring.map((r) => (
              <div key={r.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: r.active ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>
                    {r.description || (r.type === "income" ? "Düzenli gelir" : "Düzenli gider")}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.textSecondary, marginTop: 3 }}>
                    <IconCalendar size={12} color={c.textSecondary} />
                    <span>
                      {intervalLabels[r.interval]} · sonraki {formatDate(r.nextDueDate)}
                    </span>
                    {r.projectTitle && <span>· {r.projectTitle}</span>}
                  </div>
                </div>

                <span style={{ fontSize: 15, fontWeight: 500, color: r.type === "income" ? c.success : c.danger }}>
                  {r.type === "income" ? "+" : "−"}
                  {formatMoney(r.amount)}
                </span>

                <button
                  type="button"
                  onClick={() => toggleRecurring(r)}
                  style={{ ...addButton, padding: "5px 10px", fontSize: 13 }}
                >
                  {r.active ? "Duraklat" : "Sürdür"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRecurring(r)}
                  aria-label="Düzenle"
                  style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
                >
                  <IconEdit size={15} color={c.textSecondary} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteRecurring(r.id)}
                  aria-label="Sil"
                  style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
                >
                  <IconTrash size={15} color={c.danger} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hareketler */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
          <h2 style={{ ...sectionTitle, margin: 0 }}>Hareketler</h2>
          <button type="button" onClick={() => setAddingEntry(true)} style={addButton}>
            <IconPlus size={14} color={c.textSecondary} />
            Gelir / gider ekle
          </button>
        </div>

        {transactions.length === 0 ? (
          <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 15, padding: 28 }}>
            Henüz bir hareket yok.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {transactions.map((t) => (
              <div key={t.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 15, color: c.textPrimary }}>
                    {t.description || typeLabels[t.type]}
                    {t.recurringPaymentId && (
                      <span style={{ fontSize: 12, color: c.textSecondary, marginLeft: 8 }}>otomatik</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 3 }}>
                    {formatDate(t.occurredAt)}
                    {t.projectTitle ? ` · ${t.projectTitle}` : " · genel"}
                  </div>
                </div>

                <span style={{ fontSize: 15, fontWeight: 500, color: t.type === "income" ? c.success : c.danger }}>
                  {t.type === "income" ? "+" : "−"}
                  {formatMoney(t.amount)}
                </span>

                {/* Otomatik işlenen kayıt elle düzenlenmez: kaynağı düzenli
                    ödeme kuralıdır, oradan yönetilir. */}
                {!t.recurringPaymentId && (
                  <button
                    type="button"
                    onClick={() => setEditingTransaction(t)}
                    aria-label="Düzenle"
                    style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
                  >
                    <IconEdit size={15} color={c.textSecondary} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteTransaction(t.id)}
                  aria-label="Sil"
                  style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
                >
                  <IconTrash size={15} color={c.danger} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {editingTransaction && (
        <AddBudgetEntryModal
          transaction={editingTransaction}
          onClose={() => setEditingTransaction(null)}
          onSaved={(saved) => handleEntrySaved(saved, editingTransaction)}
        />
      )}
      {addingEntry && (
        <AddBudgetEntryModal onClose={() => setAddingEntry(false)} onSaved={(saved) => handleEntrySaved(saved, null)} />
      )}
      {addingRecurring && <AddRecurringPaymentModal onClose={() => setAddingRecurring(false)} onSaved={reload} />}
      {editingRecurring && (
        <AddRecurringPaymentModal
          payment={editingRecurring}
          onClose={() => setEditingRecurring(null)}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: number;
  color: string;
  hint?: string;
}) {
  const c = useThemeColors();
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 500, color }}>{formatMoney(value)}</div>
      {hint && <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
