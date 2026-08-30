import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { BudgetTransaction, BudgetTransactionType, Task, TaskBudgetStatus } from "@projelio/shared";
import { api } from "../api/client";
import { useRefreshOnUndo } from "../lib/undo";
import { useThemeColors } from "../theme/useThemeColors";
import { useFabAvailable } from "../lib/projectFab";
import { useUndo } from "../lib/undo";
import { IconEdit, IconTrash } from "./icons";

export interface DepartmentBudgetPanelHandle {
  openCreate: () => void;
}

interface Props {
  departmentId: string;
}

const typeLabel: Record<BudgetTransactionType, string> = {
  income: "Gelir",
  expense: "Gider",
  payout: "Hakediş/Ödeme",
};

const budgetStatusLabel: Record<TaskBudgetStatus, string> = {
  pending: "Bekliyor",
  planned: "Planlandı",
  paid: "Ödendi",
};

function fmtMoney(amount: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(amount);
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "10px 16px",
        borderRadius: 10,
        background: c.surface,
        border: `1px solid ${c.border}`,
        minWidth: 120,
      }}
    >
      <span style={{ fontSize: 12, color: c.textSecondary }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary }}>{value}</span>
    </div>
  );
}

// Departmanın "Bütçe" sekmesi: proje bütçe panelindeki gibi otomatik hesaplanan
// özet kartları + görev bütçesi onay akışı (bkz. panels/BudgetPanel.tsx) BURADA
// da var — departman görevlerine (Görevler sekmesinde) bütçe girildiyse, o
// görevler burada otomatik toplanıp "Bekliyor/Planlandı/Ödendi" durumuna göre
// gruplanır ve tek tıkla onaylanabilir. Bunun altında ayrıca basit bir genel
// gelir/gider defteri var (departmanın kira, malzeme gibi görev dışı kalemleri
// için) — projedeki "anlaşılan ücret/tahsilat" kavramı departmanda olmadığı
// için o kısım basit tutuldu.
const DepartmentBudgetPanel = forwardRef<DepartmentBudgetPanelHandle, Props>(function DepartmentBudgetPanel(
  { departmentId },
  ref
) {
  const c = useThemeColors();
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useImperativeHandle(ref, () => ({
    openCreate: () => setAdding(true),
  }));

  // Ekleme sayfanın "+" düğmesinde (kaydı DepartmentDetail yapıyor, yetkiyi de
  // orada denetliyor). Başlıktaki "+ Kayıt ekle" düğmesi aynı işi yapan bir
  // kopyaydı; yalnızca "+"ın ulaşılamadığı yerde (modal içi) gösteriliyor.
  const fabAvailable = useFabAvailable();
  const [type, setType] = useState<BudgetTransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  // Düzenlenen kaydın kendisi: aynı satır içi form hem ekleme hem düzenleme
  // için kullanılıyor (ayrı bir modal açmak bu panelde gereksiz bir katman).
  const [editing, setEditing] = useState<BudgetTransaction | null>(null);
  const { pushUndo, pushDestructive } = useUndo();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<BudgetTransaction[]>(`/departments/${departmentId}/budget`).catch(() => []),
      api.get<Task[]>(`/departments/${departmentId}/tasks`).catch(() => []),
    ])
      .then(([tx, ts]) => {
        setTransactions(tx);
        setTasks(ts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [departmentId]);
  // Aynı sayfadaki başka biri değiştirdiğinde de tazelenir (bkz. lib/liveRoom.ts).
  useRefreshOnUndo(load);

  const resetForm = () => {
    setType("expense");
    setAmount("");
    setDescription("");
    setOccurredAt("");
    setEditing(null);
  };

  const startEdit = (t: BudgetTransaction) => {
    setEditing(t);
    setType(t.type);
    setAmount(String(t.amount));
    setDescription(t.description ?? "");
    setOccurredAt(t.occurredAt ? t.occurredAt.slice(0, 10) : "");
    setError("");
    setAdding(true);
  };

  // Bir kaydın alanlarını sunucuda o hâle getirir. Geri/ileri alma da bunu
  // kullanır: "eski değerlere dön" ile "yeni değerleri tekrar uygula" aynı işlem.
  const applyValues = async (tx: BudgetTransaction) => {
    await api
      .patch(`/budget/transactions/${tx.id}`, {
        type: tx.type,
        amount: tx.amount,
        description: tx.description ?? "",
        occurredAt: tx.occurredAt,
      })
      .catch(() => {});
    load();
  };

  const handleSave = async () => {
    setError("");
    const n = Number(amount);
    if (!amount || Number.isNaN(n) || n <= 0) {
      setError("Geçerli bir tutar gir");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        type,
        amount: n,
        description: description || undefined,
        occurredAt: occurredAt || undefined,
      };

      if (editing) {
        const previous = editing;
        // Genel uç: yetki kaydın bağlamından (burada departman) türetilir.
        const saved = await api.patch<BudgetTransaction>(`/budget/transactions/${editing.id}`, {
          ...payload,
          description: description || "",
        });
        pushUndo({
          label: "Bütçe kaydı düzenlendi",
          run: () => applyValues(previous),
          redo: () => applyValues(saved),
        });
      } else {
        const created = await api.post<BudgetTransaction>(`/departments/${departmentId}/budget`, payload);
        // Ekleme de geri alınabilir olmalı: bütçe girerken en sık yapılan hata
        // yanlış tutar yazmak ve Cmd/Ctrl+Z burada hiç çalışmıyordu.
        pushUndo({
          label: "Bütçe kaydı eklendi",
          run: async () => {
            await api.delete(`/budget/transactions/${created.id}`).catch(() => {});
            load();
          },
          redo: async () => {
            await api.post(`/departments/${departmentId}/budget`, payload);
            load();
          },
        });
      }

      resetForm();
      setAdding(false);
      load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kayıt kaydedilemedi. Bu işlem yalnızca organizasyon sahibi veya departman yöneticisine açık."
      );
    } finally {
      setSaving(false);
    }
  };

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const handleDelete = async (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    pushDestructive({
      label: "Kayıt silme",
      commit: async () => {
        await api.delete(`/departments/${departmentId}/budget/${id}`).catch(() => {});
      },
      restore: load,
    });
  };

  const handleBudgetStatusChange = async (taskId: string, status: TaskBudgetStatus) => {
    setUpdatingTaskId(taskId);
    try {
      const updated = await api.patch<Task>(`/tasks/${taskId}/budget-status`, { budgetStatus: status });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      // güncellenemedi, kullanıcı tekrar deneyebilir
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const income = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const spent = transactions
    .filter((t) => t.type === "expense" || t.type === "payout")
    .reduce((sum, t) => sum + t.amount, 0);
  const net = income - spent;

  const budgetTasks = tasks.filter((t) => (t.budget ?? 0) > 0).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sumByStatus = (status: TaskBudgetStatus) => budgetTasks.filter((t) => t.budgetStatus === status).reduce((sum, t) => sum + (t.budget ?? 0), 0);
  const pendingTotal = sumByStatus("pending");
  const plannedTotal = sumByStatus("planned");
  const paidTotal = sumByStatus("paid");
  const approvedTotal = plannedTotal + paidTotal;

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>Görev bütçeleri</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <SummaryCard label="Onaylanan" value={fmtMoney(approvedTotal)} />
          <SummaryCard label="Bekleyen" value={fmtMoney(pendingTotal)} />
          <SummaryCard label="Planlanan" value={fmtMoney(plannedTotal)} />
          <SummaryCard label="Ödenen" value={fmtMoney(paidTotal)} />
        </div>

        {budgetTasks.length === 0 ? (
          <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
            Henüz bütçesi girilmiş bir görev yok. Görevler sekmesinde bir göreve tıklayıp bütçe (₺) girebilirsin.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {budgetTasks.map((t) => {
              const parent = t.parentTaskId ? tasks.find((p) => p.id === t.parentTaskId) : undefined;
              const label = parent ? `↳ ${t.title} (${parent.title})` : t.title;
              const busy = updatingTaskId === t.id;
              return (
                <div
                  key={t.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: c.surface, border: `1px solid ${c.border}` }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                    <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{fmtMoney(t.budget ?? 0)}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      padding: "2px 8px",
                      borderRadius: 20,
                      flexShrink: 0,
                      color: t.budgetStatus === "paid" ? c.accentDark : t.budgetStatus === "planned" ? c.primaryDark : c.textSecondary,
                      background: t.budgetStatus === "paid" ? `${c.accent}22` : t.budgetStatus === "planned" ? `${c.primary}1a` : c.background,
                    }}
                  >
                    {budgetStatusLabel[t.budgetStatus]}
                  </span>
                  {t.budgetStatus === "pending" && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleBudgetStatusChange(t.id, "planned")}
                        disabled={busy}
                        style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary }}
                      >
                        Planlandı
                      </button>
                      <button
                        onClick={() => handleBudgetStatusChange(t.id, "paid")}
                        disabled={busy}
                        style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary }}
                      >
                        Ödendi
                      </button>
                    </div>
                  )}
                  {t.budgetStatus === "planned" && (
                    <button
                      onClick={() => handleBudgetStatusChange(t.id, "paid")}
                      disabled={busy}
                      style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, flexShrink: 0 }}
                    >
                      Ödendi olarak işaretle
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>Genel gelir/gider defteri</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <SummaryCard label="Gelir" value={fmtMoney(income)} />
          <SummaryCard label="Gider" value={fmtMoney(spent)} />
          <SummaryCard label="Net" value={fmtMoney(net)} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 14, color: c.textSecondary }}>Hareketler</span>
          {!fabAvailable && (
            <button
              onClick={() => {
                setAdding((v) => !v);
                resetForm();
                setError("");
              }}
              style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none" }}
            >
              {adding ? "Vazgeç" : "+ Kayıt ekle"}
            </button>
          )}
        </div>

        {adding && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>Tür</label>
              <select value={type} onChange={(e) => setType(e.target.value as BudgetTransactionType)} style={{ width: "100%" }}>
                <option value="income">Gelir</option>
                <option value="expense">Gider</option>
                <option value="payout">Hakediş/Ödeme</option>
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>Tutar (₺)</label>
              <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>Tarih</label>
              <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} style={{ width: "100%" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 12, color: c.textSecondary }}>Açıklama</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Örn. Kira, Malzeme, Danışmanlık geliri"
                style={{ width: "100%" }}
              />
            </div>
            {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
              >
                {saving ? "Kaydediliyor…" : editing ? "Değişikliği kaydet" : "Kaydet"}
              </button>
              {/* "Vazgeçtim" yolu her zaman formun içinde: ekleme "+"a taşınınca
                  başlıktaki düğme (açıkken "Vazgeç" yazan) artık yok. */}
              <button
                onClick={() => {
                  resetForm();
                  setAdding(false);
                }}
                style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
              >
                Vazgeç
              </button>
            </div>
          </div>
        )}

        {transactions.length === 0 ? (
          <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Henüz bir gelir/gider kaydı yok.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {transactions.map((t) => (
              <div
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: c.surface, border: `1px solid ${c.border}` }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: c.textPrimary }}>
                    {t.type === "income" ? "+ " : "− "}
                    {fmtMoney(t.amount)}
                    {t.description ? ` · ${t.description}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                    {typeLabel[t.type]} · {new Date(t.occurredAt).toLocaleDateString("tr-TR")}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(t)}
                  aria-label="Kaydı düzenle"
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
                >
                  <IconEdit size={14} color={c.textSecondary} />
                </button>
                <button
                  onClick={() => handleDelete(t.id)}
                  aria-label="Kaydı sil"
                  style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 4 }}
                >
                  <IconTrash size={14} color={c.textSecondary} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default DepartmentBudgetPanel;
