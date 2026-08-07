import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { ModuleRecord } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import AddModuleRecordModal from "./AddModuleRecordModal";
import { useUndo } from "../lib/undo";
import { IconTrash } from "./icons";

export type BudgetQuickAddKind = "income" | "expense" | "receivable" | "payable";

export interface OrgBudgetPanelHandle {
  openQuickAdd: (kind: BudgetQuickAddKind) => void;
}

interface Props {
  organizationId: string;
}

const LEDGER_KEY = "fm_gelir_gider";
const RP_KEY = "fm_alacak_borc";

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function fmtDate(value: unknown): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("tr-TR");
}

/** records içindeki `amount`ları para birimine göre gruplayıp toplar. */
function sumByCurrency(records: ModuleRecord[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of records) {
    const currency = (r.data.currency as string) || "TRY";
    const amount = Number(r.data.amount) || 0;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals;
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const c = colors.light;
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
        minWidth: 140,
        flex: "1 1 140px",
      }}
    >
      <span style={{ fontSize: 12, color: c.textSecondary }}>{label}</span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: tone === "positive" ? c.success : tone === "negative" ? c.danger : c.textPrimary,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Şirket "Bütçe" sekmesi: gelir/gider defteri + alacak/borç takibi.
 *
 * Departman bütçe panelinden farkı — burada görev bazlı bir bütçe onay akışı
 * yok (organizasyonların kendine ait bir "İşler" listesi olmadığı için, bkz.
 * OrganizationDetail'deki aynı not); yalnızca genel gelir/gider defteri + henüz
 * tahsil/ödeme yapılmamış alacak-borç kayıtları var. İkisi de generic
 * module-records sistemi üzerinden tutulur (bkz. moduleRecordConfigs.ts
 * fm_gelir_gider / fm_alacak_borc) — yeni bir tablo/migration gerekmedi.
 */
const OrgBudgetPanel = forwardRef<OrgBudgetPanelHandle, Props>(function OrgBudgetPanel({ organizationId }, ref) {
  const c = colors.light;
  const [ledger, setLedger] = useState<ModuleRecord[]>([]);
  const [rp, setRp] = useState<ModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [quickAdd, setQuickAdd] = useState<BudgetQuickAddKind | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const { pushDestructive } = useUndo();

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${LEDGER_KEY}`).catch(() => []),
      api.get<ModuleRecord[]>(`/organizations/${organizationId}/module-records?moduleKey=${RP_KEY}`).catch(() => []),
    ]).then(([l, r]) => {
      setLedger(l);
      setRp(r);
      setLoading(false);
    });
  };

  useEffect(load, [organizationId]);

  useImperativeHandle(ref, () => ({
    openQuickAdd: (kind) => setQuickAdd(kind),
  }));

  // Silme hemen sunucuya gitmez: satır listeden düşürülür, gerçek DELETE birkaç
  // saniye sonra atılır; bu pencerede Cmd/Ctrl+Z basılırsa istek hiç gönderilmez.
  const handleDelete = async (id: string) => {
    // Kayıt iki listeden birinde: hangisinde olduğunu bilmeye gerek yok, ikisinden de düş.
    setLedger((prev) => prev.filter((r) => r.id !== id));
    setRp((prev) => prev.filter((r) => r.id !== id));
    pushDestructive({
      label: "Kayıt silme",
      commit: async () => {
        await api.delete(`/module-records/${id}`).catch(() => {});
      },
      restore: load,
    });
  };

  const handleSettle = async (record: ModuleRecord) => {
    setSettlingId(record.id);
    try {
      await api.patch(`/module-records/${record.id}`, { data: { ...record.data, status: "settled" } });
      load();
    } catch {
      // güncellenemedi, kullanıcı tekrar deneyebilir
    } finally {
      setSettlingId(null);
    }
  };

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>;

  const incomeRecords = ledger
    .filter((r) => r.data.type === "income")
    .sort((a, b) => String(b.data.entryDate ?? b.createdAt).localeCompare(String(a.data.entryDate ?? a.createdAt)));
  const expenseRecords = ledger
    .filter((r) => r.data.type === "expense")
    .sort((a, b) => String(b.data.entryDate ?? b.createdAt).localeCompare(String(a.data.entryDate ?? a.createdAt)));

  const openReceivables = rp.filter((r) => r.data.type !== "payable" && r.data.status !== "settled");
  const openPayables = rp.filter((r) => r.data.type === "payable" && r.data.status !== "settled");
  const settledRp = rp.filter((r) => r.data.status === "settled");

  const incomeTotals = sumByCurrency(incomeRecords);
  const expenseTotals = sumByCurrency(expenseRecords);
  const receivableTotals = sumByCurrency(openReceivables);
  const payableTotals = sumByCurrency(openPayables);
  const currencies = new Set([...incomeTotals.keys(), ...expenseTotals.keys(), ...receivableTotals.keys(), ...payableTotals.keys()]);
  if (currencies.size === 0) currencies.add("TRY");

  const quickAddConfig: Record<BudgetQuickAddKind, { moduleKey: string; title: string; preset: Record<string, string> }> = {
    income: { moduleKey: LEDGER_KEY, title: "Gelir ekle", preset: { type: "income" } },
    expense: { moduleKey: LEDGER_KEY, title: "Gider ekle", preset: { type: "expense" } },
    receivable: { moduleKey: RP_KEY, title: "Alacak ekle", preset: { type: "receivable", status: "open" } },
    payable: { moduleKey: RP_KEY, title: "Borç ekle", preset: { type: "payable", status: "open" } },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* --- özet --- */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {Array.from(currencies).map((currency) => {
          const income = incomeTotals.get(currency) ?? 0;
          const expense = expenseTotals.get(currency) ?? 0;
          const net = income - expense;
          const receivable = receivableTotals.get(currency) ?? 0;
          const payable = payableTotals.get(currency) ?? 0;
          const suffix = currencies.size > 1 ? ` (${currency})` : "";
          return (
            <div key={currency} style={{ display: "flex", flexWrap: "wrap", gap: 8, width: "100%" }}>
              <SummaryCard label={`Toplam gelir${suffix}`} value={fmtMoney(income, currency)} tone="positive" />
              <SummaryCard label={`Toplam gider${suffix}`} value={fmtMoney(expense, currency)} tone="negative" />
              <SummaryCard label={`Net${suffix}`} value={fmtMoney(net, currency)} tone={net >= 0 ? "positive" : "negative"} />
              <SummaryCard label={`Açık alacak${suffix}`} value={fmtMoney(receivable, currency)} />
              <SummaryCard label={`Açık borç${suffix}`} value={fmtMoney(payable, currency)} />
            </div>
          );
        })}
      </div>

      {/* --- T tablosu: gelir solda, gider sağda --- */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>Gelir / Gider</h4>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <LedgerColumn title="Gelir" records={incomeRecords} tone="positive" onDelete={handleDelete} borderRight />
          <LedgerColumn title="Gider" records={expenseRecords} tone="negative" onDelete={handleDelete} />
        </div>
      </div>

      {/* --- alacak / borç --- */}
      <div>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" }}>Alacak / Borç</h4>
        {openReceivables.length + openPayables.length + settledRp.length === 0 ? (
          <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Henüz alacak/borç kaydı yok.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[...openReceivables, ...openPayables, ...settledRp].map((r) => {
              const isPayable = r.data.type === "payable";
              const isSettled = r.data.status === "settled";
              const busy = settlingId === r.id;
              return (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    opacity: isSettled ? 0.6 : 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "3px 9px",
                      borderRadius: 20,
                      flexShrink: 0,
                      color: isPayable ? c.danger : c.success,
                      background: isPayable ? `${c.danger}18` : `${c.success}18`,
                    }}
                  >
                    {isPayable ? "Borç" : "Alacak"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {(r.data.counterparty as string) ?? ""}
                      {r.data.category ? ` · ${r.data.category}` : ""}
                    </div>
                    <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                      {fmtMoney(Number(r.data.amount) || 0, (r.data.currency as string) || "TRY")}
                      {fmtDate(r.data.dueDate) ? ` · Vade: ${fmtDate(r.data.dueDate)}` : ""}
                    </div>
                  </div>
                  {!isSettled && (
                    <button
                      onClick={() => handleSettle(r)}
                      disabled={busy}
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "none",
                        background: c.primary,
                        color: "#fff",
                        flexShrink: 0,
                        cursor: busy ? "wait" : "pointer",
                      }}
                    >
                      {isPayable ? "Ödendi" : "Tahsil edildi"}
                    </button>
                  )}
                  {isSettled && (
                    <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                      {isPayable ? "Ödendi" : "Tahsil edildi"}
                    </span>
                  )}
                  <button
                    onClick={() => handleDelete(r.id)}
                    aria-label="Kaydı sil"
                    style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex" }}
                  >
                    <IconTrash size={14} color={c.textSecondary} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {quickAdd && (
        <AddModuleRecordModal
          organizationId={organizationId}
          moduleKey={quickAddConfig[quickAdd].moduleKey}
          presetData={quickAddConfig[quickAdd].preset}
          titleOverride={quickAddConfig[quickAdd].title}
          onClose={() => setQuickAdd(null)}
          onSaved={load}
        />
      )}
    </div>
  );
});

export default OrgBudgetPanel;

function LedgerColumn({
  title,
  records,
  tone,
  onDelete,
  borderRight,
}: {
  title: string;
  records: ModuleRecord[];
  tone: "positive" | "negative";
  onDelete: (id: string) => void;
  borderRight?: boolean;
}) {
  const c = colors.light;
  return (
    <div style={{ borderRight: borderRight ? `1px solid ${c.border}` : undefined }}>
      <div
        style={{
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 500,
          color: tone === "positive" ? c.success : c.danger,
          background: c.background,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        {title}
      </div>
      {records.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: 12 }}>Kayıt yok.</p>
      ) : (
        <div>
          {records.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 12px",
                borderBottom: `1px solid ${c.border}`,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fmtMoney(Number(r.data.amount) || 0, (r.data.currency as string) || "TRY")}
                  {r.data.category ? ` · ${r.data.category}` : ""}
                </div>
                <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[fmtDate(r.data.entryDate), r.data.description as string | undefined].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button
                onClick={() => onDelete(r.id)}
                aria-label="Kaydı sil"
                style={{ background: "transparent", border: "none", flexShrink: 0, display: "flex" }}
              >
                <IconTrash size={13} color={c.textSecondary} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
