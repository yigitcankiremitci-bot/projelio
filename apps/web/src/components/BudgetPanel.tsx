import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BudgetOverview, BudgetTransaction, RecurringPayment } from "@projelio/shared";
import { api } from "../api/client";
import { useRefreshOnUndo } from "../lib/undo";
import { FAB_PRIORITY, useProjectFabAction } from "../lib/projectFab";
import { useThemeColors } from "../theme/useThemeColors";
import AddBudgetEntryModal from "./AddBudgetEntryModal";
import AddRecurringPaymentModal from "./AddRecurringPaymentModal";
import { useUndo } from "../lib/undo";
import { IconTrash, IconEdit, IconCalendar, IconFolder } from "./icons";
import { useT } from "../lib/i18n";

function formatMoney(amount: number): string {
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₺`;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

// Metinler t() ile burada değil, kullanıldıkları yerde çevriliyor: modül
// düzeyinde kanca çağrılamaz, Türkçe metin anahtar olarak kalır.
const intervalLabels: Record<string, string> = {
  weekly: "Her hafta", // dil:anahtar
  monthly: "Her ay", // dil:anahtar
  yearly: "Her yıl", // dil:anahtar
};

const typeLabels: Record<string, string> = {
  income: "Gelen ödeme", // dil:anahtar
  expense: "Gider", // dil:anahtar
  payout: "Hakediş ödemesi", // dil:anahtar
};

/**
 * Silinen bir kaydı özet toplamlarından düşer (iyimser güncelleme).
 *
 * Sunucudaki hesabın birebir aynısını burada tekrarlamıyoruz — yalnızca silinen
 * kaydın etkisini geri alıyoruz. Kalıcı doğruluk commit sonrası gelen
 * /budget/overview yanıtından geliyor; buradaki iş yalnızca aradaki birkaç
 * saniyede ekranın yalan söylememesi.
 */
function ozettenDus(ozet: BudgetOverview, tx: BudgetTransaction): BudgetOverview {
  const tutar = Number(tx.amount) || 0;
  const genel = !tx.projectId;

  if (tx.type === "income") {
    return {
      ...ozet,
      totalReceived: ozet.totalReceived - tutar,
      netEarned: ozet.netEarned - tutar,
      generalIncome: genel ? ozet.generalIncome - tutar : ozet.generalIncome,
    };
  }

  // expense ve payout, ikisi de gider tarafında.
  return {
    ...ozet,
    totalExpense: ozet.totalExpense - tutar,
    netEarned: ozet.netEarned + tutar,
    generalExpense: genel ? ozet.generalExpense - tutar : ozet.generalExpense,
  };
}

export default function BudgetPanel() {
  const c = useThemeColors();
  const t = useT();
  const [overview, setOverview] = useState<BudgetOverview | null>(null);
  const [transactions, setTransactions] = useState<BudgetTransaction[]>([]);
  const [recurring, setRecurring] = useState<RecurringPayment[]>([]);
  const [addingEntry, setAddingEntry] = useState(false);

  const [editingTransaction, setEditingTransaction] = useState<BudgetTransaction | null>(null);
  const [addingRecurring, setAddingRecurring] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringPayment | null>(null);
  const { pushUndo, pushDestructive } = useUndo();
  // Anasayfadaki "+" düğmesi, sayfa kendi eylemini KAYDETMEZSE varsayılana —
  // "Yeni iş"e — düşüyor (bkz. BottomNav.tsx). Bütçe sekmesi bunu kaydetmediği
  // için gelir/gider eklemek isteyen kullanıcıya iş oluşturma ekranı açılıyordu.
  // BottomNav'daki yorumda aynı hatanın Yapılacaklar sayfasında yaşandığı yazıyor;
  // desen bu: yeni bir sekme eklerken kendi "+" eylemini de kaydet.
  //
  // Sekmede iki ayrı ekleme var (tek seferlik hareket ve düzenli ödeme); ikisi de
  // bölüm başlıklarında ayrı düğmelerdeydi, artık tek "+" menüsünde.
  useProjectFabAction(
    {
      label: t("Ekle"),
      options: [
        { label: t("Gelir / gider ekle"), onClick: () => setAddingEntry(true) },
        { label: t("Düzenli ödeme ekle"), onClick: () => setAddingRecurring(true) },
      ],
    },
    [],
    FAB_PRIORITY.panel
  );

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
    const silinen = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    // Satır anında listeden düşüyordu ama ÜSTTEKİ TOPLAMLAR eski kalıyordu:
    // özet ayrı bir uçtan (/budget/overview) geliyor ve yalnızca reload() ile
    // tazeleniyor — o da geri alma penceresi dolduktan saniyeler sonra çalışıyor.
    // Kullanıcı "sildim ama düşmedi" diye sayfayı yeniliyordu. Toplamı burada
    // aynı iyimser mantıkla düşüyoruz; commit sonrası gelen reload zaten
    // sunucudaki gerçek değerle üzerine yazacak.
    if (silinen) setOverview((prev) => (prev ? ozettenDus(prev, silinen) : prev));
    pushDestructive({
      label: t("Kayıt silme"),
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
        label: t("Bütçe kaydı düzenlendi"),
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
      label: t("Bütçe kaydı eklendi"),
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
      label: t("Düzenli ödeme silme"),
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
        <SummaryCard label={t("Anlaşılan ücret")} value={overview?.totalAgreedFee ?? 0} color={c.textPrimary} />
        <SummaryCard label={t("Gelen ödeme")} value={overview?.totalReceived ?? 0} color={c.success} />
        <SummaryCard label={t("Beklenen ödeme")} value={overview?.totalExpected ?? 0} color={c.warning} />
        <SummaryCard label={t("Gider")} value={overview?.totalExpense ?? 0} color={c.danger} />
        <SummaryCard
          label={t("Net kazanç")}
          value={overview?.netEarned ?? 0}
          color={(overview?.netEarned ?? 0) < 0 ? c.danger : c.success}
          hint={t("Gelen ödeme − gider")}
        />
      </div>

      {/* Proje bazlı tahsilat durumu */}
      <section>
        <h2 style={sectionTitle}>{t("Projelere göre tahsilat")}</h2>
        {!overview || overview.projects.length === 0 ? (
          <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 15, padding: 28 }}>
            {t("Henüz bütçesi olan bir projen yok.")}
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
                        {t("Tahsilat tamam")}
                        {p.overpaid > 0 && t(" · +{tutar} fazla", { tutar: formatMoney(p.overpaid) })}
                      </span>
                    ) : (
                      <span style={{ fontSize: 14, color: c.textSecondary }}>
                        {t("{tutar} anlaşıldı", { tutar: formatMoney(p.agreedFee) })}
                      </span>
                    )}
                  </div>

                  {/* Tahsilat ilerlemesi */}
                  <div style={{ height: 6, borderRadius: 999, background: c.background, overflow: "hidden", marginBottom: 10 }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: c.success }} />
                  </div>

                  <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
                    <span style={{ color: c.textSecondary }}>
                      {t("Gelen")} <strong style={{ color: c.success, fontWeight: 500 }}>{formatMoney(p.received)}</strong>
                    </span>
                    <span style={{ color: c.textSecondary }}>
                      {t("Beklenen")}{" "}
                      <strong style={{ color: p.expected > 0 ? c.warning : c.textSecondary, fontWeight: 500 }}>
                        {formatMoney(p.expected)}
                      </strong>
                    </span>
                    {p.expense > 0 && (
                      <span style={{ color: c.textSecondary }}>
                        {t("Gider")} <strong style={{ color: c.danger, fontWeight: 500 }}>{formatMoney(p.expense)}</strong>
                      </span>
                    )}
                    <span style={{ color: c.textSecondary }}>
                      {t("Net")}{" "}
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
        <h2 style={sectionTitle}>{t("Düzenli ödemeler")}</h2>

        {recurring.length === 0 ? (
          <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 15, padding: 28 }}>
            {t(
              'Kira, abonelik gibi tekrar eden ödemeleri sayfadaki "+" ile ekle. Vadesi gelince bütçene otomatik işlenir ve bildirim gönderilir.'
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recurring.map((r) => (
              <div key={r.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: r.active ? 1 : 0.55 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>
                    {r.description || (r.type === "income" ? t("Düzenli gelir") : t("Düzenli gider"))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: c.textSecondary, marginTop: 3 }}>
                    <IconCalendar size={12} color={c.textSecondary} />
                    <span>
                      {t("{aralik} · sonraki {tarih}", {
                        aralik: t(intervalLabels[r.interval]),
                        tarih: formatDate(r.nextDueDate),
                      })}
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
                  {r.active ? t("Duraklat") : t("Sürdür")}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRecurring(r)}
                  aria-label={t("Düzenle")}
                  style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
                >
                  <IconEdit size={15} color={c.textSecondary} />
                </button>
                <button
                  type="button"
                  onClick={() => deleteRecurring(r.id)}
                  aria-label={t("Sil")}
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
        <h2 style={sectionTitle}>{t("Hareketler")}</h2>

        {transactions.length === 0 ? (
          <div style={{ ...cardStyle, borderStyle: "dashed", textAlign: "center", color: c.textSecondary, fontSize: 15, padding: 28 }}>
            {t('Henüz bir hareket yok. Gelir/gider eklemek için sayfadaki "+" düğmesini kullan.')}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {transactions.map((hareket) => (
              <div key={hareket.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontSize: 15, color: c.textPrimary }}>
                    {hareket.description || t(typeLabels[hareket.type])}
                    {hareket.recurringPaymentId && (
                      <span style={{ fontSize: 12, color: c.textSecondary, marginLeft: 8 }}>{t("otomatik")}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 3 }}>
                    {formatDate(hareket.occurredAt)}
                    {hareket.projectTitle ? ` · ${hareket.projectTitle}` : t(" · genel")}
                  </div>
                </div>

                <span style={{ fontSize: 15, fontWeight: 500, color: hareket.type === "income" ? c.success : c.danger }}>
                  {hareket.type === "income" ? "+" : "−"}
                  {formatMoney(hareket.amount)}
                </span>

                {/* Otomatik işlenen kayıt elle düzenlenmez: kaynağı düzenli
                    ödeme kuralıdır, oradan yönetilir. */}
                {!hareket.recurringPaymentId && (
                  <button
                    type="button"
                    onClick={() => setEditingTransaction(hareket)}
                    aria-label={t("Düzenle")}
                    style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
                  >
                    <IconEdit size={15} color={c.textSecondary} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteTransaction(hareket.id)}
                  aria-label={t("Sil")}
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
