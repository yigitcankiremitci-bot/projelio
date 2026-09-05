import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { BudgetTransaction, Project, ProjectMember, Task } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { IconPlus, IconX, IconEdit, IconTrash } from "../icons";
import CreateBudgetTransactionModal from "../CreateBudgetTransactionModal";
import { useUndo, useWithoutPendingDeletes } from "../../lib/undo";
import { useT } from "../../lib/i18n";

export interface BudgetPanelHandle {
  openCreate: () => void;
}

interface Props {
  project: Project;
  tasks: Task[];
  projectId: string;
  currentUserId?: string;
  isOwner: boolean;
  onTaskUpdated: (task: Task) => void;
}

function SummaryCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div style={{ flex: 1, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
      <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 600, color, margin: 0 }}>{amount.toLocaleString("tr-TR")} ₺</p>
    </div>
  );
}

const BudgetPanel = forwardRef<BudgetPanelHandle, Props>(function BudgetPanel(
  { project, tasks, projectId, currentUserId, isOwner, onTaskUpdated },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [addingViewer, setAddingViewer] = useState(false);
  const [viewerToAdd, setViewerToAdd] = useState("");
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BudgetTransaction | null>(null);
  const { pushUndo, pushDestructive } = useUndo();

  const reloadTransactions = () => {
    api
      .get<BudgetTransaction[]>(`/projects/${projectId}/budget`)
      .then(setTransactions)
      .catch(() => setTransactions([]));
  };

  // Kayıt ekleme/düzenleme de geri alınabilir olmalı: bütçe girerken en sık
  // yapılan hata yanlış tutar yazmak ve Cmd/Ctrl+Z burada hiç çalışmıyordu.
  const handleCreated = (tx: BudgetTransaction) => {
    setTransactions((prev) => [tx, ...prev]);
    pushUndo({
      label: tx.type === "income" ? "Ödeme eklendi" : "Gider eklendi",
      run: async () => {
        await api.delete(`/budget/transactions/${tx.id}`).catch(() => {});
        reloadTransactions();
      },
      redo: async () => {
        await api.post(`/projects/${projectId}/budget`, {
          type: tx.type,
          amount: tx.amount,
          description: tx.description,
        });
        reloadTransactions();
      },
    });
  };

  const handleEdited = (previous: BudgetTransaction, saved: BudgetTransaction) => {
    setTransactions((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    const apply = async (value: BudgetTransaction) => {
      await api
        .patch(`/budget/transactions/${value.id}`, {
          type: value.type,
          amount: value.amount,
          description: value.description ?? "",
        })
        .catch(() => {});
      reloadTransactions();
    };
    pushUndo({
      label: "Bütçe kaydı düzenlendi",
      run: () => apply(previous),
      redo: () => apply(saved),
    });
  };

  const handleDelete = (tx: BudgetTransaction) => {
    pushDestructive({
      label: "Bütçe kaydı silindi",
      entityId: tx.id,
      commit: async () => {
        await api.delete(`/budget/transactions/${tx.id}`).catch(() => {});
        reloadTransactions();
      },
      restore: reloadTransactions,
    });
  };

  // Silinmeyi bekleyen kayıt (geri alma penceresi) sunucudan hâlâ geliyor; elenir.
  const visibleTransactions = useWithoutPendingDeletes(transactions);

  useEffect(() => {
    setLoading(true);
    api
      .get<ProjectMember[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    api
      .get<BudgetTransaction[]>(`/projects/${projectId}/budget`)
      .then(setTransactions)
      .catch(() => setTransactions([]));
  }, [projectId]);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreatingEntry(true),
  }));

  const myMembership = members.find((m) => m.userId === currentUserId);
  const canView = isOwner || myMembership?.canViewBudget;

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  if (!canView) {
    return (
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 16 }}>
        <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>{t("Bu projenin bütçesini görüntüleme yetkin yok.")}</p>
      </div>
    );
  }

  const budgetTasks = tasks.filter((t) => (t.budget ?? 0) > 0);
  const sumBy = (status: Task["budgetStatus"]) =>
    budgetTasks.filter((t) => t.budgetStatus === status).reduce((sum, t) => sum + (t.budget ?? 0), 0);
  const pendingTotal = sumBy("pending");
  const plannedTotal = sumBy("planned");
  const paidTotal = sumBy("paid");
  const approvedTotal = plannedTotal + paidTotal;

  // Tahsilat mantığı: project.totalBudget müşteriyle anlaşılan TOPLAM ücrettir.
  // "income" hareketleri bu ücretin parça parça tahsil edilmiş halidir — bu yüzden
  // anlaşılan ücretin ÜSTÜNE EKLENMEZ, içinden düşülür. Aksi halde aynı para iki kez
  // sayılır ve alacak olduğundan yüksek görünür.
  const agreedFee = project.totalBudget;
  const received = transactions.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const expectedPayment = Math.max(0, agreedFee - received);
  const overpaid = Math.max(0, received - agreedFee);
  const fullyCollected = agreedFee > 0 && received >= agreedFee;

  // Dışarı çıkan para: elle eklenen gider/hakediş + ödendi olarak işaretlenmiş görev bütçeleri.
  const manualExpense = transactions
    .filter((t) => t.type === "expense" || t.type === "payout")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSpent = paidTotal + manualExpense;
  // Eldeki net: tahsil edilen − harcanan.
  const netEarned = received - totalSpent;

  const setBudgetStatus = async (task: Task, status: Task["budgetStatus"]) => {
    setApprovingId(task.id);
    try {
      const updated = await api.patch<Task>(`/tasks/${task.id}/budget-status`, { budgetStatus: status });
      onTaskUpdated(updated);
    } catch {
      // durum güncellenemedi
    } finally {
      setApprovingId(null);
    }
  };

  const setVisibility = async (member: ProjectMember, canViewBudget: boolean) => {
    try {
      const updated = await api.patch<ProjectMember>(`/members/${member.id}/budget-visibility`, { canViewBudget });
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      // güncellenemedi
    }
  };

  const viewers = members.filter((m) => m.canViewBudget);
  const nonViewers = members.filter((m) => !m.canViewBudget);

  const handleAddViewer = () => {
    const member = members.find((m) => m.id === viewerToAdd);
    if (!member) return;
    setVisibility(member, true);
    setViewerToAdd("");
    setAddingViewer(false);
  };

  const taskLabel = (t: Task) => {
    if (!t.parentTaskId) return t.title;
    const parent = tasks.find((p) => p.id === t.parentTaskId);
    return `↳ ${t.title}${parent ? ` (${parent.title})` : ""}`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <SummaryCard label="Onaylanan" amount={approvedTotal} color={c.success} />
        <SummaryCard label="Beklenen" amount={pendingTotal} color={c.warning} />
        <SummaryCard label="Planlanan" amount={plannedTotal} color={c.primary} />
        <SummaryCard label={t("Ödenen")} amount={paidTotal} color={c.accentDark} />
      </div>

      {/* Tahsilat durumu */}
      <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{t("Anlaşılan ücret")}</p>
            <p style={{ fontSize: 19, fontWeight: 600, color: c.textPrimary, margin: 0 }}>
              {agreedFee.toLocaleString("tr-TR")} ₺
            </p>
          </div>
          {fullyCollected && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: c.success,
                background: `${c.success}1a`,
                padding: "3px 10px",
                borderRadius: 20,
              }}
            >
              Tahsilat tamam
              {overpaid > 0 && ` · +${overpaid.toLocaleString("tr-TR")} ₺ fazla`}
            </span>
          )}
        </div>

        <div style={{ height: 6, borderRadius: 20, background: c.background, overflow: "hidden", marginBottom: 12 }}>
          <div
            style={{
              width: `${agreedFee > 0 ? Math.min(100, (received / agreedFee) * 100) : 0}%`,
              height: "100%",
              background: c.success,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 110 }}>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{t("Gelen ödeme")}</p>
            <p style={{ fontSize: 19, fontWeight: 600, color: c.success, margin: 0 }}>
              {received.toLocaleString("tr-TR")} ₺
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{t("Beklenen ödeme")}</p>
            <p
              style={{
                fontSize: 19,
                fontWeight: 600,
                color: expectedPayment > 0 ? c.warning : c.textSecondary,
                margin: 0,
              }}
            >
              {expectedPayment.toLocaleString("tr-TR")} ₺
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{t("Yapılan harcamalar")}</p>
            <p style={{ fontSize: 19, fontWeight: 600, color: c.danger, margin: 0 }}>
              {totalSpent.toLocaleString("tr-TR")} ₺
            </p>
          </div>
          <div style={{ flex: 1, minWidth: 110 }}>
            <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>{t("Net kazanç")}</p>
            <p style={{ fontSize: 19, fontWeight: 600, color: netEarned < 0 ? c.danger : c.success, margin: 0 }}>
              {netEarned.toLocaleString("tr-TR")} ₺
            </p>
            <p style={{ fontSize: 12, color: c.textSecondary, margin: "2px 0 0" }}>{t("Gelen ödeme − harcama")}</p>
          </div>
        </div>
      </div>

      <div>
        <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 8px" }}>{t("Ödeme hareketleri")}</h4>
        {visibleTransactions.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary }}>
            Müşteriden tahsil ettiğin ödemeleri "gelen ödeme" olarak ekle; beklenen ödemeden otomatik düşülür. Eklemek
            için alttaki + butonunu kullan.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visibleTransactions.map((kayit) => {
              const isIncome = kayit.type === "income";
              const color = isIncome ? c.success : c.danger;
              return (
                <div
                  key={kayit.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      flexShrink: 0,
                      padding: "2px 8px",
                      borderRadius: 20,
                      color,
                      background: `${color}1a`,
                    }}
                  >
                    {isIncome ? "Gelen ödeme" : kayit.type === "payout" ? "Hakediş" : "Gider"}
                  </span>
                  <span style={{ fontSize: 15, color: c.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {kayit.description || (isIncome ? "Gelen ödeme" : "Gider")}
                  </span>
                  <span style={{ fontSize: 13, color: c.textSecondary, flexShrink: 0 }}>
                    {new Date(kayit.createdAt).toLocaleDateString("tr-TR")}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 500, color, flexShrink: 0 }}>
                    {isIncome ? "+" : "-"}
                    {kayit.amount.toLocaleString("tr-TR")} ₺
                  </span>

                  {/* Düğmeler `isOwner`a BAĞLANMAZ: proje kaydında owner_id boş
                      olabiliyor (kayıt işin sahibine ait sayılır), o durumda
                      sunucu işleme izin verdiği hâlde düğmeler gizleniyordu.
                      Yetki kontrolü zaten sunucuda (assertCanManageTransaction);
                      kayıt ekleme düğmesi de aynı şekilde açık.
                      Düzenli ödemeden otomatik düşen kayıt elle değiştirilmez,
                      kuralın kendisinden yönetilir (bkz. RecurringPayment). */}
                  {!kayit.recurringPaymentId && (
                    <span style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={() => setEditingEntry(kayit)}
                        aria-label={t("Kaydı düzenle")}
                        style={{ background: "transparent", border: "none", padding: 4, display: "flex", cursor: "pointer" }}
                      >
                        <IconEdit size={14} color={c.textSecondary} />
                      </button>
                      <button
                        onClick={() => handleDelete(kayit)}
                        aria-label={t("Kaydı sil")}
                        style={{ background: "transparent", border: "none", padding: 4, display: "flex", cursor: "pointer" }}
                      >
                        <IconTrash size={14} color={c.textSecondary} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: "0 0 8px" }}>{t("Görev bütçeleri")}</h4>
        {budgetTasks.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Bütçe eklenmiş görev yok.")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {budgetTasks.map((kayit) => (
              <div
                key={kayit.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <span style={{ fontSize: 15, color: c.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {taskLabel(kayit)}
                </span>
                <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, flexShrink: 0 }}>
                  {(kayit.budget ?? 0).toLocaleString("tr-TR")} ₺
                </span>
                <span
                  style={{
                    fontSize: 12,
                    flexShrink: 0,
                    padding: "2px 8px",
                    borderRadius: 20,
                    color: kayit.budgetStatus === "paid" ? c.success : kayit.budgetStatus === "planned" ? c.primary : c.warning,
                    background:
                      kayit.budgetStatus === "paid" ? `${c.success}1a` : kayit.budgetStatus === "planned" ? `${c.primary}1a` : `${c.warning}1a`,
                  }}
                >
                  {kayit.budgetStatus === "paid" ? "Ödendi" : kayit.budgetStatus === "planned" ? "Planlandı" : "Bekliyor"}
                </span>
                {isOwner && kayit.budgetStatus === "pending" && (
                  <>
                    <button
                      onClick={() => setBudgetStatus(kayit, "planned")}
                      disabled={approvingId === kayit.id}
                      style={{ fontSize: 13, padding: "4px 9px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, flexShrink: 0 }}
                    >
                      {t("Planlandı")}
                    </button>
                    <button
                      onClick={() => setBudgetStatus(kayit, "paid")}
                      disabled={approvingId === kayit.id}
                      style={{ fontSize: 13, padding: "4px 9px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, flexShrink: 0 }}
                    >
                      {t("Ödendi")}
                    </button>
                  </>
                )}
                {isOwner && kayit.budgetStatus === "planned" && (
                  <button
                    onClick={() => setBudgetStatus(kayit, "paid")}
                    disabled={approvingId === kayit.id}
                    style={{ fontSize: 13, padding: "4px 9px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, flexShrink: 0 }}
                  >
                    {t("Ödendi olarak işaretle")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Bütçeyi kimler görebilir")}</h4>
            <button
              onClick={() => setAddingViewer((v) => !v)}
              disabled={nonViewers.length === 0}
              aria-label={t("Görüntüleyici ekle")}
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                border: "none",
                background: nonViewers.length === 0 ? c.border : c.primary,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconPlus size={13} color="#fff" />
            </button>
          </div>

          <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 8px" }}>
            {t("Varsayılan olarak bütçeyi yalnızca proje yöneticisi görür. Aşağıya eklediğin ekip üyeleri de görebilir.")}
          </p>

          {addingViewer && (
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <select value={viewerToAdd} onChange={(e) => setViewerToAdd(e.target.value)} style={{ flex: 1 }}>
                <option value="">{t("Üye seç…")}</option>
                {nonViewers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName ?? "Bilinmeyen kullanıcı"}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAddViewer}
                disabled={!viewerToAdd}
                style={{ fontSize: 15, padding: "0 12px", borderRadius: 7, border: "none", background: c.primary, color: c.onPrimary }}
              >
                {t("Ekle")}
              </button>
            </div>
          )}

          {viewers.length === 0 ? (
            <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Şu an sadece sen görebiliyorsun.")}</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {viewers.map((m) => (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <span style={{ fontSize: 15, color: c.textPrimary }}>{m.fullName ?? "Bilinmeyen kullanıcı"}</span>
                  <button
                    onClick={() => setVisibility(m, false)}
                    aria-label={t("Görüntüleme yetkisini kaldır")}
                    style={{ background: "transparent", border: "none", padding: 2, display: "flex" }}
                  >
                    <IconX size={13} color={c.textSecondary} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {creatingEntry && (
        <CreateBudgetTransactionModal
          projectId={projectId}
          onClose={() => setCreatingEntry(false)}
          onSaved={handleCreated}
        />
      )}

      {editingEntry && (
        <CreateBudgetTransactionModal
          projectId={projectId}
          transaction={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSaved={(saved) => handleEdited(editingEntry, saved)}
        />
      )}
    </div>
  );
});

export default BudgetPanel;
