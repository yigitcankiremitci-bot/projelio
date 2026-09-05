import { fmtMoney, sumByCurrency, todayISO } from "../moduleConfigs";
import {
  NA,
  countRecords,
  groupBy,
  percent,
  recordsOf,
  recordsOfAll,
  sumMoney,
  type PanelConfig,
} from "./types";

// FİNANS panelleri. Hepsi gelir-gider defterinden ve komşu modüllerden okur;
// hiçbiri veri girişi almaz.

const LEDGER = "fm_gelir_gider";
const RECEIVABLES = "fm_alacak_borc";
const INVOICES = "fm_fatura";
const BUDGET_PLAN = "fm_butce_hazirlama";

const isIncome = (d: Record<string, unknown>) => d.type === "income";
const isExpense = (d: Record<string, unknown>) => d.type === "expense";

/** Gelir eksi gider; para birimi başına ayrı satır. */
function netByCurrency(rows: { data: Record<string, unknown> }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const currency = (r.data.currency as string) || "TRY";
    const amount = Number(r.data.amount) || 0;
    totals.set(currency, (totals.get(currency) ?? 0) + (r.data.type === "expense" ? -amount : amount));
  }
  return totals;
}

function formatTotals(totals: Map<string, number>): string {
  if (totals.size === 0) return fmtMoney(0, "TRY");
  return Array.from(totals.entries())
    .map(([c, v]) => fmtMoney(v, c))
    .join(" + ");
}

// ============================================================ Analiz ve Rapor
export const financeAnalysisPanel: PanelConfig = {
  title: "Finansal Analiz",
  purpose: "Seçilen dönemde ne kazanıldı, ne harcandı ve para nereye gitti.", // dil:anahtar
  sources: [LEDGER, INVOICES, RECEIVABLES],
  metrics: [
    {
      label: "Gelir",
      sources: [LEDGER],
      compute: (ctx) => sumMoney(ctx, [LEDGER], "amount", isIncome),
    },
    {
      label: "Gider",
      sources: [LEDGER],
      compute: (ctx) => sumMoney(ctx, [LEDGER], "amount", isExpense),
    },
    {
      label: "Net",
      sources: [LEDGER],
      compute: (ctx) => formatTotals(netByCurrency(recordsOf(ctx, LEDGER))),
      hint: (ctx) => {
        const rows = recordsOf(ctx, LEDGER);
        const income = rows.filter((r) => isIncome(r.data)).length;
        const expense = rows.filter((r) => isExpense(r.data)).length;
        return rows.length ? `${income} gelir · ${expense} gider kaydı` : undefined; // dil:atla
      },
    },
    {
      label: "Bekleyen fatura",
      sources: [INVOICES],
      compute: (ctx) => String(countRecords(ctx, [INVOICES], (d) => d.status === "pending")),
      hint: (ctx) => {
        const bekleyen = recordsOf(ctx, INVOICES).filter((r) => r.data.status === "pending");
        if (bekleyen.length === 0) return undefined;
        return formatTotals(sumByCurrency(bekleyen)) + " tutarında"; // dil:atla
      },
    },
  ],
  breakdowns: [
    {
      title: "Gider kategorileri",
      sources: [LEDGER],
      emptyLabel: "Bu dönemde gider kaydı yok.", // dil:anahtar
      compute: (ctx) =>
        groupBy(
          recordsOf(ctx, LEDGER).filter((r) => isExpense(r.data)),
          "category",
          (v) => v,
          { sumField: "amount" }
        ),
    },
    {
      title: "Gelir kategorileri",
      sources: [LEDGER],
      emptyLabel: "Bu dönemde gelir kaydı yok.", // dil:anahtar
      compute: (ctx) =>
        groupBy(
          recordsOf(ctx, LEDGER).filter((r) => isIncome(r.data)),
          "category",
          (v) => v,
          { sumField: "amount" }
        ),
    },
  ],
};

// ============================================================ Nakit Akış
export const cashFlowPanel: PanelConfig = {
  title: "Nakit Akış", // dil:anahtar
  purpose: "Paranın ne zaman girip ne zaman çıktığı; yaklaşan tahsilat ve ödemeler.", // dil:anahtar
  sources: [LEDGER, RECEIVABLES],
  metrics: [
    {
      label: "Giren",
      sources: [LEDGER],
      compute: (ctx) => sumMoney(ctx, [LEDGER], "amount", isIncome),
    },
    {
      label: "Çıkan", // dil:anahtar
      sources: [LEDGER],
      compute: (ctx) => sumMoney(ctx, [LEDGER], "amount", isExpense),
    },
    {
      label: "Açık alacak", // dil:anahtar
      sources: [RECEIVABLES],
      compute: (ctx) =>
        sumMoney(ctx, [RECEIVABLES], "amount", (d) => d.type !== "payable" && d.status !== "settled"),
    },
    {
      label: "Açık borç", // dil:anahtar
      sources: [RECEIVABLES],
      compute: (ctx) => sumMoney(ctx, [RECEIVABLES], "amount", (d) => d.type === "payable" && d.status !== "settled"),
      hint: (ctx) => {
        // Vadesi geçmiş borç, nakit akışının en acil sinyali.
        const today = todayISO();
        const geciken = recordsOf(ctx, RECEIVABLES).filter(
          (r) =>
            r.data.type === "payable" &&
            r.data.status !== "settled" &&
            typeof r.data.dueDate === "string" &&
            r.data.dueDate < today
        );
        return geciken.length ? `${geciken.length} tanesinin vadesi geçti` : undefined; // dil:atla
      },
    },
  ],
  breakdowns: [
    {
      title: "Aylık hareket", // dil:anahtar
      sources: [LEDGER],
      emptyLabel: "Bu dönemde para hareketi yok.", // dil:anahtar
      compute: (ctx) => {
        // Ay bazında net; hangi ay artıda hangi ay ekside görünsün.
        const byMonth = new Map<string, number>();
        for (const r of recordsOf(ctx, LEDGER)) {
          const date = r.data.entryDate;
          if (typeof date !== "string" || date.length < 7) continue;
          const month = date.slice(0, 7);
          const amount = Number(r.data.amount) || 0;
          byMonth.set(month, (byMonth.get(month) ?? 0) + (r.data.type === "expense" ? -amount : amount));
        }
        return Array.from(byMonth.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, value]) => ({ label: month, value, display: fmtMoney(value, "TRY") }));
      },
    },
  ],
};

// ============================================================ Bütçe Yönetimi
export const budgetPanel: PanelConfig = {
  title: "Bütçe Yönetimi", // dil:anahtar
  purpose: "Planlanan ile gerçekleşen arasındaki fark; nerede sapma var.", // dil:anahtar
  sources: [BUDGET_PLAN, LEDGER],
  metrics: [
    {
      label: "Planlanan gider",
      sources: [BUDGET_PLAN],
      compute: (ctx) => sumMoney(ctx, [BUDGET_PLAN], "plannedAmount", (d) => d.direction !== "income"),
    },
    {
      label: "Gerçekleşen gider", // dil:anahtar
      sources: [LEDGER],
      compute: (ctx) => sumMoney(ctx, [LEDGER], "amount", isExpense),
    },
    {
      label: "Kullanım", // dil:anahtar
      sources: [BUDGET_PLAN, LEDGER],
      compute: (ctx) => {
        // Yalnızca TRY üzerinden: farklı para birimlerini oranlamak kur
        // dönüşümü gerektirir, o da bu katmanın işi değil.
        const planned = sumByCurrency(
          recordsOf(ctx, BUDGET_PLAN).filter((r) => r.data.direction !== "income"),
          "plannedAmount"
        ).get("TRY");
        const actual = sumByCurrency(recordsOf(ctx, LEDGER).filter((r) => isExpense(r.data))).get("TRY");
        if (!planned) return NA;
        return percent(actual ?? 0, planned);
      },
      hint: () => "TRY kalemleri üzerinden", // dil:anahtar
    },
    {
      label: "Bütçe kalemi", // dil:anahtar
      sources: [BUDGET_PLAN],
      compute: (ctx) => String(countRecords(ctx, [BUDGET_PLAN])),
    },
  ],
  breakdowns: [
    {
      title: "Kalem bazında plan", // dil:anahtar
      sources: [BUDGET_PLAN],
      emptyLabel: "Henüz bütçe kalemi girilmemiş.", // dil:anahtar
      compute: (ctx) =>
        groupBy(recordsOf(ctx, BUDGET_PLAN), "category", (v) => v, { sumField: "plannedAmount" }),
    },
  ],
};

// ============================================================ Finansal Planlama
export const financialPlanningPanel: PanelConfig = {
  title: "Finansal Planlama",
  purpose: "Mevcut gidişata göre dönem sonunda nerede olunacağı.", // dil:anahtar
  sources: [LEDGER, RECEIVABLES],
  metrics: [
    {
      label: "Dönem neti", // dil:anahtar
      sources: [LEDGER],
      compute: (ctx) => formatTotals(netByCurrency(recordsOf(ctx, LEDGER))),
    },
    {
      label: "Beklenen tahsilat",
      sources: [RECEIVABLES],
      compute: (ctx) =>
        sumMoney(ctx, [RECEIVABLES], "amount", (d) => d.type !== "payable" && d.status !== "settled"),
      hint: () => "Henüz tahsil edilmemiş alacaklar", // dil:anahtar
    },
    {
      label: "Beklenen ödeme", // dil:anahtar
      sources: [RECEIVABLES],
      compute: (ctx) => sumMoney(ctx, [RECEIVABLES], "amount", (d) => d.type === "payable" && d.status !== "settled"),
    },
    {
      label: "Projeksiyon",
      sources: [LEDGER, RECEIVABLES],
      // Net + açık alacak − açık borç: dönem sonu tahmini nakit pozisyonu.
      compute: (ctx) => {
        const totals = netByCurrency(recordsOf(ctx, LEDGER));
        for (const r of recordsOf(ctx, RECEIVABLES)) {
          if (r.data.status === "settled") continue;
          const currency = (r.data.currency as string) || "TRY";
          const amount = Number(r.data.amount) || 0;
          totals.set(currency, (totals.get(currency) ?? 0) + (r.data.type === "payable" ? -amount : amount));
        }
        return formatTotals(totals);
      },
      hint: () => "Net + açık alacak − açık borç", // dil:anahtar
    },
  ],
};

// ============================================================ Denetim
export const auditPanel: PanelConfig = {
  title: "Denetim",
  purpose: "Eksik kalan, gecikmiş ve dikkat isteyen kayıtlar.", // dil:anahtar
  sources: [LEDGER, RECEIVABLES, INVOICES, "hud_sozlesme", "fm_vergi_takip", "fm_risk_yonetimi"],
  metrics: [
    {
      label: "Kategorisiz kayıt", // dil:anahtar
      sources: [LEDGER],
      // Kategorisi olmayan kayıt hiçbir kırılımda görünmez; analiz eksik kalır.
      compute: (ctx) => String(countRecords(ctx, [LEDGER], (d) => !d.category)),
      hint: () => "Kategori girilmemiş gelir/gider", // dil:anahtar
    },
    {
      label: "Vadesi geçen", // dil:anahtar
      sources: [RECEIVABLES, "fm_vergi_takip"],
      compute: (ctx) => {
        const today = todayISO();
        const gecikmis = recordsOfAll(ctx, [RECEIVABLES, "fm_vergi_takip"]).filter(
          (r) =>
            r.data.status !== "settled" &&
            r.data.status !== "paid" &&
            typeof r.data.dueDate === "string" &&
            r.data.dueDate < today
        );
        return String(gecikmis.length);
      },
    },
    {
      label: "Süresi dolan sözleşme", // dil:anahtar
      sources: ["hud_sozlesme"],
      compute: (ctx) => String(countRecords(ctx, ["hud_sozlesme"], (d) => d.status === "expired")),
    },
    {
      label: "Açık kritik risk", // dil:anahtar
      sources: ["fm_risk_yonetimi"],
      compute: (ctx) =>
        String(
          countRecords(
            ctx,
            ["fm_risk_yonetimi"],
            (d) => d.status !== "closed" && d.likelihood === "high" && d.impact === "high"
          )
        ),
    },
  ],
};
