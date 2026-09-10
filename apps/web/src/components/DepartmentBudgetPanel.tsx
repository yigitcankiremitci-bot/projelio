import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import type { BudgetTransaction, BudgetTransactionType, Task, TaskBudgetStatus } from "@projelio/shared";
import { api } from "../api/client";
import { useRefreshOnUndo } from "../lib/undo";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useFabAvailable } from "../lib/projectFab";
import { useUndo } from "../lib/undo";
import { sirala, type SiralamaKey } from "../lib/butceOzeti";
import BudgetTrendChart from "./BudgetTrendChart";
import KasaFiltreCubugu, { type OdakSecenegi } from "./KasaFiltreCubugu";
import { IconEdit, IconTrash } from "./icons";
import { useT } from "../lib/i18n";

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

/**
 * Departman kasasının odağı.
 *
 * Kişisel ve şirket kasasındaki süzgeçler VADE üzerinden çalışıyor; burada
 * vade taşıyan bir kayıt yok (departman defterinde yalnızca gerçekleşmiş
 * hareketler var). Onun yerine ölçüt görev bütçesinin ONAY DURUMU: kullanıcının
 * bu ekranda yapacağı iş zaten bekleyen bütçeleri onaylamak.
 */
type OdakKey = "tumu" | "bekleyen" | "planlanan" | "odenen";

const odakSecenekleri: OdakSecenegi<OdakKey>[] = [
  { key: "tumu", label: "Tümü", ipucu: "Her şey" }, // dil:anahtar
  { key: "bekleyen", label: "Onay bekleyen", ipucu: "Bütçesi girilmiş, henüz onaylanmamış görevler" }, // dil:anahtar
  { key: "planlanan", label: "Planlanan", ipucu: "Onaylanmış ama henüz ödenmemiş görev bütçeleri" }, // dil:anahtar
  { key: "odenen", label: "Ödenenler", ipucu: "Ödenmiş görev bütçeleri ve deftere işlenmiş gelir/giderler" }, // dil:anahtar
];

function fmtMoney(amount: number, kisa = false): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    // Grafiğin tavan etiketi dar bir şeride sığmalı: "₺15 B".
    ...(kisa ? { notation: "compact" as const, maximumFractionDigits: 1 } : {}),
  }).format(amount);
}

function fmtDate(value: string): string {
  return new Date(value).toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric" });
}

function SummaryCard({ label, value, tone, vurgulu }: { label: string; value: string; tone?: "positive" | "negative"; vurgulu?: boolean }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        background: vurgulu ? `${c.accent}12` : c.surface,
        border: `1px solid ${vurgulu ? c.accent : c.border}`,
        borderRadius: 10,
        padding: "9px 11px",
      }}
    >
      <div style={{ fontSize: 11.5, color: c.textSecondary, marginBottom: 3 }}>{label}</div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: tone === "positive" ? c.success : tone === "negative" ? c.danger : c.textPrimary,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// Departmanın "Kasa" sekmesi: proje bütçe panelindeki gibi otomatik hesaplanan
// özet + görev bütçesi onay akışı (bkz. panels/BudgetPanel.tsx) BURADA da var —
// departman görevlerine (Görevler sekmesinde) bütçe girildiyse, o görevler
// burada otomatik toplanıp "Bekliyor/Planlandı/Ödendi" durumuna göre gruplanır
// ve tek tıkla onaylanabilir. Bunun altında ayrıca bir gelir/gider defteri var
// (departmanın kira, malzeme gibi görev dışı kalemleri için) — projedeki
// "anlaşılan ücret/tahsilat" kavramı departmanda olmadığı için o kısım basit.
//
// Düzen kişisel ve şirket kasasıyla aynı: özet şeridi → grafik → süzgeç çubuğu
// → listeler. Üç kasa arasında gezinen kullanıcı yeni bir ekran öğrenmesin.
const DepartmentBudgetPanel = forwardRef<DepartmentBudgetPanelHandle, Props>(function DepartmentBudgetPanel(
  { departmentId },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
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
  const [siralama, setSiralama] = useState<SiralamaKey>("yakin");
  const [odak, setOdak] = useState<OdakKey>("tumu");
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

  const startEdit = (kayit: BudgetTransaction) => {
    setEditing(kayit);
    setType(kayit.type);
    setAmount(String(kayit.amount));
    setDescription(kayit.description ?? "");
    setOccurredAt(kayit.occurredAt ? kayit.occurredAt.slice(0, 10) : "");
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
      setError(t("Geçerli bir tutar gir"));
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

  const budgetTasks = tasks.filter((t) => (t.budget ?? 0) > 0);
  const sumByStatus = (status: TaskBudgetStatus) =>
    budgetTasks.filter((t) => t.budgetStatus === status).reduce((sum, t) => sum + (t.budget ?? 0), 0);
  const pendingTotal = sumByStatus("pending");
  const plannedTotal = sumByStatus("planned");
  const paidTotal = sumByStatus("paid");
  const approvedTotal = plannedTotal + paidTotal;
  const sayByStatus = (status: TaskBudgetStatus) => budgetTasks.filter((t) => t.budgetStatus === status).length;

  const siraliGorevler = useMemo(
    () => sirala(budgetTasks, siralama, (g) => g.createdAt, (g) => g.budget ?? 0, true),
    // budgetTasks her render'da yeniden üretiliyor; bağımlılık kaynak listeler.
    [tasks, siralama]
  );
  const siraliHareketler = useMemo(
    () => sirala(transactions, siralama, (h) => h.occurredAt, (h) => Number(h.amount), true),
    [transactions, siralama]
  );

  const gorunenGorevler = siraliGorevler.filter((g) => {
    if (odak === "tumu") return true;
    if (odak === "bekleyen") return g.budgetStatus === "pending";
    if (odak === "planlanan") return g.budgetStatus === "planned";
    return g.budgetStatus === "paid";
  });
  const defterGorunur = odak === "tumu" || odak === "odenen";
  const bosSuzgec = odak !== "tumu" && gorunenGorevler.length === 0 && (!defterGorunur || transactions.length === 0);

  const gelirler = siraliHareketler.filter((h) => h.type === "income");
  const giderler = siraliHareketler.filter((h) => h.type !== "income");

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  const bosKart = {
    border: `1px dashed ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    padding: 22,
    textAlign: "center",
    color: c.textSecondary,
    fontSize: 14,
  } as const;

  const sectionTitle = { fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: "0 0 10px" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Özet şerit: defter solda (kasanın kendisi), görev bütçeleri sağda. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))", gap: 8 }}>
        <SummaryCard label={t("Net")} value={fmtMoney(net)} tone={net >= 0 ? "positive" : "negative"} vurgulu />
        <SummaryCard label={t("Gelir")} value={fmtMoney(income)} tone="positive" />
        <SummaryCard label={t("Gider")} value={fmtMoney(spent)} tone="negative" />
        <SummaryCard label={t("Onaylanan")} value={fmtMoney(approvedTotal)} />
        <SummaryCard label={t("Bekleyen")} value={fmtMoney(pendingTotal)} />
        <SummaryCard label={t("Ödenen")} value={fmtMoney(paidTotal)} />
      </div>

      {/* Biçimlendirici panelin kendisinden: özet kutularıyla grafiğin
          tutarları aynı görünsün (burada ₺ önde, kişisel kasada arkada). */}
      <BudgetTrendChart transactions={transactions} formatla={(tutar, kisa) => fmtMoney(tutar, kisa)} />

      <KasaFiltreCubugu
        odaklar={odakSecenekleri.map((secenek) => ({
          ...secenek,
          sayi:
            secenek.key === "bekleyen"
              ? sayByStatus("pending")
              : secenek.key === "planlanan"
                ? sayByStatus("planned")
                : secenek.key === "odenen"
                  ? sayByStatus("paid") + transactions.length
                  : undefined,
          // Onay bekleyen bütçe varsa süzgeç seçili olmasa da dikkat çeker:
          // bekleyen onay, bu ekranda kullanıcıdan iş isteyen tek şey.
          uyari: secenek.key === "bekleyen" && sayByStatus("pending") > 0,
        }))}
        odak={odak}
        onOdak={setOdak}
        siralama={siralama}
        onSiralama={setSiralama}
        siralamaId="departman-kasa-sirala"
      />

      {bosSuzgec && <div style={bosKart}>{t("Bu süzgece uyan kayıt yok.")}</div>}

      {/* Görev bütçeleri: onay bekleyenler bu ekranda kullanıcıdan iş isteyen
          tek şey, o yüzden defterin üstünde. */}
      {(gorunenGorevler.length > 0 || odak === "tumu") && (
        <section>
          <h2 style={sectionTitle}>{t("Görev bütçeleri")}</h2>
          {gorunenGorevler.length === 0 ? (
            <div style={bosKart}>
              Henüz bütçesi girilmiş bir görev yok. Görevler sekmesinde bir göreve tıklayıp bütçe (₺) girebilirsin.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {gorunenGorevler.map((kayit) => {
                const parent = kayit.parentTaskId ? tasks.find((p) => p.id === kayit.parentTaskId) : undefined;
                const label = parent ? `↳ ${kayit.title} (${parent.title})` : kayit.title;
                const busy = updatingTaskId === kayit.id;
                return (
                  <div
                    key={kayit.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                      padding: "9px 12px",
                      borderRadius: 10,
                      background: c.surface,
                      border: `1px solid ${c.border}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {label}
                      </div>
                      <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{fmtMoney(kayit.budget ?? 0)}</div>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 8px",
                        borderRadius: 999,
                        flexShrink: 0,
                        color: kayit.budgetStatus === "paid" ? c.accentDark : kayit.budgetStatus === "planned" ? c.primaryDark : c.textSecondary,
                        background: kayit.budgetStatus === "paid" ? `${c.accent}22` : kayit.budgetStatus === "planned" ? `${c.primary}1a` : c.background,
                      }}
                    >
                      {t(budgetStatusLabel[kayit.budgetStatus])}
                    </span>
                    {kayit.budgetStatus === "pending" && (
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => handleBudgetStatusChange(kayit.id, "planned")}
                          disabled={busy}
                          style={{ fontSize: 12, padding: "4px 9px", borderRadius: 7, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, cursor: "pointer" }}
                        >
                          {t("Planlandı")}
                        </button>
                        <button
                          onClick={() => handleBudgetStatusChange(kayit.id, "paid")}
                          disabled={busy}
                          style={{ fontSize: 12, padding: "4px 9px", borderRadius: 7, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
                        >
                          {t("Ödendi")}
                        </button>
                      </div>
                    )}
                    {kayit.budgetStatus === "planned" && (
                      <button
                        onClick={() => handleBudgetStatusChange(kayit.id, "paid")}
                        disabled={busy}
                        style={{ fontSize: 12, padding: "4px 9px", borderRadius: 7, border: "none", background: c.primary, color: c.onPrimary, flexShrink: 0, cursor: "pointer" }}
                      >
                        {t("Ödendi olarak işaretle")}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Gelir/gider defteri — gelir solda, gider sağda: tek listede ikisi iç
          içe geçtiğinde hangi tarafın ağır bastığı okunmuyordu. */}
      {defterGorunur && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h2 style={{ ...sectionTitle, margin: 0 }}>{t("Gelir / Gider")}</h2>
            {!fabAvailable && (
              <button
                onClick={() => {
                  setAdding((v) => !v);
                  resetForm();
                  setError("");
                }}
                style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
              >
                {adding ? "Vazgeç" : "+ Kayıt ekle"}
              </button>
            )}
          </div>

          {adding && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Tür")}</label>
                <select value={type} onChange={(e) => setType(e.target.value as BudgetTransactionType)} style={{ width: "100%" }}>
                  <option value="income">{t("Gelir")}</option>
                  <option value="expense">{t("Gider")}</option>
                  <option value="payout">{t("Hakediş/Ödeme")}</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: c.textSecondary }}>Tutar (₺)</label>
                <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Tarih")}</label>
                <input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} style={{ width: "100%" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Açıklama")}</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("Örn. Kira, Malzeme, Danışmanlık geliri")}
                  style={{ width: "100%" }}
                />
              </div>
              {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14, cursor: "pointer" }}
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
                  style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14, cursor: "pointer" }}
                >
                  {t("Vazgeç")}
                </button>
              </div>
            </div>
          )}

          {transactions.length === 0 ? (
            <div style={bosKart}>{t("Henüz bir gelir/gider kaydı yok.")}</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                overflow: "hidden",
                background: c.surface,
              }}
            >
              <HareketSutunu
                baslik={t("Gelir")}
                hareketler={gelirler}
                renk={c.success}
                isaret="+"
                onEdit={startEdit}
                onDelete={handleDelete}
                borderRight={isDesktop}
              />
              <HareketSutunu
                baslik={t("Gider")}
                hareketler={giderler}
                renk={c.danger}
                isaret="−"
                onEdit={startEdit}
                onDelete={handleDelete}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
});

export default DepartmentBudgetPanel;

/** T tablosunun bir sütunu: başlık + toplam, altında hareketler. */
function HareketSutunu({
  baslik,
  hareketler,
  renk,
  isaret,
  onEdit,
  onDelete,
  borderRight,
}: {
  baslik: string;
  hareketler: BudgetTransaction[];
  renk: string;
  isaret: string;
  onEdit: (tx: BudgetTransaction) => void;
  onDelete: (id: string) => void;
  borderRight?: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const toplam = hareketler.reduce((sum, h) => sum + Number(h.amount), 0);

  return (
    <div style={{ borderRight: borderRight ? `1px solid ${c.border}` : undefined, minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 500,
          color: renk,
          background: c.background,
          borderBottom: `1px solid ${c.border}`,
        }}
      >
        <span>{baslik}</span>
        <span>
          {isaret}
          {fmtMoney(toplam)}
        </span>
      </div>

      {hareketler.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: 12 }}>{t("Kayıt yok.")}</p>
      ) : (
        hareketler.map((kayit) => (
          <div
            key={kayit.id}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${c.border}` }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {kayit.description || t(typeLabel[kayit.type])}
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                {fmtDate(kayit.occurredAt)}
                {kayit.type === "payout" ? ` · ${t(typeLabel.payout)}` : ""}
              </div>
            </div>

            <span style={{ fontSize: 14, fontWeight: 500, color: renk, flexShrink: 0 }}>
              {isaret}
              {fmtMoney(kayit.amount)}
            </span>

            <button
              onClick={() => onEdit(kayit)}
              aria-label={t("Kaydı düzenle")}
              style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 3, flexShrink: 0 }}
            >
              <IconEdit size={14} color={c.textSecondary} />
            </button>
            <button
              onClick={() => onDelete(kayit.id)}
              aria-label={t("Kaydı sil")}
              style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 3, flexShrink: 0 }}
            >
              <IconTrash size={14} color={c.danger} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
