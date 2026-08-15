import {
  NOTES_FIELD,
  countBy,
  countWhere,
  currencyField,
  fmtMoney,
  joinDetail,
  labelOf,
  moneyStats,
  opts,
  partyField,
  sumByCurrency,
  todayISO,
  userField,
  type ModuleRecordConfig,
} from "./shared";

// FİNANS MUHASEBE departmanının modülleri.
//
// Bu departmandaki para hareketleri bugün module_records üzerinde tutuluyor;
// proje bütçesiyle (budget_transactions) birleştirilmesi Faz 4'e ait —
// bkz. docs/moduller/02-karar-notu-butce-vs-muhasebe.md

// ============================================================ Gelir-Gider
const ENTRY_TYPE = { income: "Gelir", expense: "Gider" };

export const financeEntryConfig: ModuleRecordConfig = {
  periodKey: "entryDate",
  title: "Gelir-Gider",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz gelir/gider kaydı yok.",
  fields: [
    { key: "type", label: "Tür", type: "select", required: true, defaultValue: "income", options: opts(ENTRY_TYPE) },
    currencyField("amount", "Tutar", { required: true }),
    { key: "category", label: "Kategori", type: "text", placeholder: "Örn. Kira, Yazılım, Satış" },
    { key: "entryDate", label: "Tarih", type: "date" },
    { key: "description", label: "Açıklama", type: "textarea" },
  ],
  summary: (d) =>
    `${d.type === "expense" ? "− " : "+ "}${fmtMoney(d.amount, d.currency)}${d.category ? ` · ${d.category}` : ""}`,
  detail: (d) => joinDetail(d.entryDate as string, d.description as string),
  computeStats: (records) => {
    const totals = new Map<string, number>();
    for (const r of records) {
      const currency = (r.data.currency as string) || "TRY";
      const amount = Number(r.data.amount) || 0;
      totals.set(currency, (totals.get(currency) ?? 0) + (r.data.type === "expense" ? -amount : amount));
    }
    if (totals.size === 0) return [{ label: "Kayıt", value: "0" }];
    return Array.from(totals.entries()).map(([currency, net]) => ({
      label: `Net bakiye (${currency})`,
      value: fmtMoney(net, currency),
    }));
  },
};

// ============================================================ Alacak-Borç
// Şirket Bütçe sekmesindeki gelir/gider defterinden ayrı: burada henüz TAHSİL
// EDİLMEMİŞ/ÖDENMEMİŞ tutarlar (kimden alacaklısın, kime borçlusun) takip edilir —
// vade tarihi ve açık/kapandı durumuyla (bkz. OrgBudgetPanel).
const RP_TYPE = { receivable: "Alacak", payable: "Borç" };
const RP_STATUS = { open: "Açık", settled: "Kapandı" };

export const receivablesPayablesConfig: ModuleRecordConfig = {
  periodKey: "dueDate",
  title: "Alacak-Borç",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz alacak/borç kaydı yok.",
  fields: [
    { key: "type", label: "Tür", type: "select", required: true, defaultValue: "receivable", options: opts(RP_TYPE) },
    partyField("counterparty", "Kimden / Kime", { required: true }),
    currencyField("amount", "Tutar", { required: true }),
    { key: "category", label: "Kategori", type: "text", placeholder: "Örn. Satış, Kira, Hizmet" },
    { key: "dueDate", label: "Vade tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(RP_STATUS) },
    { key: "description", label: "Açıklama", type: "textarea" },
  ],
  summary: (d) => `${labelOf(RP_TYPE, d.type) ?? "Alacak"} · ${d.counterparty ?? ""} · ${fmtMoney(d.amount, d.currency)}`,
  detail: (d) => {
    const statusLabel = d.status === "settled" ? (d.type === "payable" ? "Ödendi" : "Tahsil edildi") : "Açık";
    return joinDetail(statusLabel, d.dueDate as string, d.category as string);
  },
  computeStats: (records) => {
    const openReceivable = records.filter((r) => r.data.type !== "payable" && r.data.status !== "settled");
    const openPayable = records.filter((r) => r.data.type === "payable" && r.data.status !== "settled");
    return [...moneyStats("Açık alacak", openReceivable), ...moneyStats("Açık borç", openPayable)];
  },
};

// ============================================================ Fatura
const INVOICE_DIRECTION = { issued: "Kesilen", received: "Alınan" };
const INVOICE_STATUS = { pending: "Bekliyor", paid: "Ödendi" };

export const invoiceConfig: ModuleRecordConfig = {
  periodKey: "issueDate",
  title: "Faturalar",
  addLabel: "Fatura ekle",
  emptyLabel: "Henüz fatura kaydı yok.",
  fields: [
    {
      key: "direction",
      label: "Yön",
      type: "select",
      required: true,
      defaultValue: "issued",
      options: opts(INVOICE_DIRECTION),
    },
    partyField("counterpartyName", "Müşteri / Tedarikçi", { required: true }),
    { key: "invoiceNo", label: "Fatura no", type: "text" },
    currencyField("amount", "Tutar", { required: true }),
    { key: "status", label: "Durum", type: "select", defaultValue: "pending", options: opts(INVOICE_STATUS) },
    { key: "issueDate", label: "Tarih", type: "date" },
  ],
  summary: (d) => `${d.counterpartyName ?? ""} · ${fmtMoney(d.amount, d.currency)}`,
  detail: (d) => {
    const no = d.invoiceNo ? `#${d.invoiceNo}` : undefined;
    return joinDetail(no, labelOf(INVOICE_DIRECTION, d.direction), labelOf(INVOICE_STATUS, d.status), d.issueDate as string);
  },
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Bekleyen", value: String(countBy(records, "status", "pending")) },
    { label: "Ödenen", value: String(countBy(records, "status", "paid")) },
  ],
};

// ============================================================ Vergi takibi
// Beyanname ve ödeme yükümlülükleri takvimi. Vade yaklaşınca hatırlatma üretmesi
// (otomatik görev) A5 takvim motoruyla gelecek — bugün elle takip ediliyor.
const TAX_TYPE = {
  kdv: "KDV",
  muhtasar: "Muhtasar",
  gecici: "Geçici Vergi",
  kurumlar: "Kurumlar Vergisi",
  sgk: "SGK Primi",
  damga: "Damga Vergisi",
  other: "Diğer",
};
const TAX_STATUS = { pending: "Bekliyor", declared: "Beyan edildi", paid: "Ödendi" };

export const taxTrackingConfig: ModuleRecordConfig = {
  periodKey: "dueDate",
  title: "Vergi Takibi",
  addLabel: "Yükümlülük ekle",
  emptyLabel: "Henüz vergi yükümlülüğü kaydı yok.",
  fields: [
    { key: "taxType", label: "Vergi türü", type: "select", required: true, defaultValue: "kdv", options: opts(TAX_TYPE) },
    { key: "period", label: "Dönem", type: "text", required: true, placeholder: "Örn. 2026/07" },
    { key: "dueDate", label: "Son ödeme tarihi", type: "date", required: true },
    currencyField("amount", "Tutar"),
    { key: "status", label: "Durum", type: "select", defaultValue: "pending", options: opts(TAX_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) =>
    `${labelOf(TAX_TYPE, d.taxType) ?? "Vergi"}${d.period ? ` · ${d.period}` : ""}${d.amount ? ` · ${fmtMoney(d.amount, d.currency)}` : ""}`,
  detail: (d) => joinDetail(labelOf(TAX_STATUS, d.status), d.dueDate ? `Son ödeme: ${d.dueDate}` : undefined),
  computeStats: (records) => {
    const pending = records.filter((r) => r.data.status !== "paid");
    // Vadesi geçmiş ve hâlâ ödenmemiş olanlar ayrıca uyarılır — bu modülün en
    // kritik göstergesi gecikme.
    const today = todayISO();
    const overdue = countWhere(records, (d) => d.status !== "paid" && typeof d.dueDate === "string" && d.dueDate < today);
    return [
      { label: "Bekleyen", value: String(pending.length) },
      { label: "Vadesi geçen", value: String(overdue) },
      ...moneyStats("Bekleyen tutar", pending),
    ];
  },
};

// ============================================================ Bütçe hazırlama
// Plan tarafı: hangi kaleme ne kadar ayrıldığı. Gerçekleşme karşılaştırması
// (plan vs gerçek) A6 panel motoruyla gelecek — panel_butce.
const BUDGET_DIRECTION = { income: "Gelir", expense: "Gider" };

export const budgetPlanConfig: ModuleRecordConfig = {
  title: "Bütçe Kalemleri",
  addLabel: "Kalem ekle",
  emptyLabel: "Henüz bütçe kalemi yok.",
  fields: [
    { key: "category", label: "Kalem / Kategori", type: "text", required: true, placeholder: "Örn. Personel, Pazarlama" },
    {
      key: "direction",
      label: "Tür",
      type: "select",
      required: true,
      defaultValue: "expense",
      options: opts(BUDGET_DIRECTION),
    },
    currencyField("plannedAmount", "Planlanan tutar", { required: true }),
    { key: "period", label: "Dönem", type: "text", placeholder: "Örn. 2026 Q3, 2026" },
    userField("owner", "Sorumlu"),
    NOTES_FIELD,
  ],
  summary: (d) =>
    `${d.direction === "income" ? "+ " : "− "}${fmtMoney(d.plannedAmount, d.currency)} · ${d.category ?? ""}`,
  detail: (d) => joinDetail(d.period as string, d.owner as string),
  computeStats: (records) => {
    const income = sumByCurrency(records.filter((r) => r.data.direction === "income"), "plannedAmount");
    const expense = sumByCurrency(records.filter((r) => r.data.direction !== "income"), "plannedAmount");
    const currencies = new Set([...income.keys(), ...expense.keys()]);
    if (currencies.size === 0) return [{ label: "Kalem", value: "0" }];
    return Array.from(currencies).map((currency) => {
      const net = (income.get(currency) ?? 0) - (expense.get(currency) ?? 0);
      return { label: currencies.size > 1 ? `Planlanan net (${currency})` : "Planlanan net", value: fmtMoney(net, currency) };
    });
  },
};

// ============================================================ Sermaye ve yatırım takibi
const INVESTMENT_TYPE = {
  capital: "Sermaye artırımı",
  equipment: "Ekipman",
  marketing: "Pazarlama",
  rnd: "Ar-Ge",
  equity: "Hisse / Ortaklık",
  other: "Diğer",
};
const INVESTMENT_STATUS = { planned: "Planlandı", done: "Yapıldı", returned: "Geri döndü", cancelled: "İptal" };

export const investmentConfig: ModuleRecordConfig = {
  periodKey: "investmentDate",
  title: "Sermaye ve Yatırım",
  addLabel: "Yatırım ekle",
  emptyLabel: "Henüz yatırım kaydı yok.",
  fields: [
    { key: "title", label: "Yatırım", type: "text", required: true },
    {
      key: "investmentType",
      label: "Tür",
      type: "select",
      defaultValue: "equipment",
      options: opts(INVESTMENT_TYPE),
    },
    currencyField("amount", "Tutar", { required: true }),
    { key: "investmentDate", label: "Tarih", type: "date" },
    { key: "expectedReturnPercent", label: "Beklenen getiri (%)", type: "number" },
    { key: "status", label: "Durum", type: "select", defaultValue: "planned", options: opts(INVESTMENT_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.title ?? ""} · ${fmtMoney(d.amount, d.currency)}`,
  detail: (d) =>
    joinDetail(
      labelOf(INVESTMENT_TYPE, d.investmentType),
      labelOf(INVESTMENT_STATUS, d.status),
      d.expectedReturnPercent ? `Beklenen getiri %${d.expectedReturnPercent}` : undefined,
      d.investmentDate as string
    ),
  computeStats: (records) => [
    ...moneyStats("Toplam yatırım", records.filter((r) => r.data.status !== "cancelled")),
    { label: "Planlanan", value: String(countBy(records, "status", "planned")) },
    { label: "Geri dönen", value: String(countBy(records, "status", "returned")) },
  ],
};

// ============================================================ Risk yönetimi
// Klasik risk register: risk / olasılık / etki / sahip / aksiyon.
const RISK_CATEGORY = {
  financial: "Finansal",
  operational: "Operasyonel",
  legal: "Hukuki",
  reputation: "İtibar",
  technology: "Teknolojik",
  market: "Piyasa",
};
const RISK_LEVEL = { low: "Düşük", medium: "Orta", high: "Yüksek" };
const RISK_STATUS = { open: "Açık", monitoring: "İzleniyor", closed: "Kapandı" };

export const riskConfig: ModuleRecordConfig = {
  title: "Risk Kayıtları",
  addLabel: "Risk ekle",
  emptyLabel: "Henüz risk kaydı yok.",
  fields: [
    { key: "title", label: "Risk", type: "text", required: true },
    { key: "category", label: "Kategori", type: "select", defaultValue: "operational", options: opts(RISK_CATEGORY) },
    { key: "likelihood", label: "Olasılık", type: "select", defaultValue: "medium", options: opts(RISK_LEVEL) },
    { key: "impact", label: "Etki", type: "select", defaultValue: "medium", options: opts(RISK_LEVEL) },
    userField("owner", "Sorumlu"),
    { key: "mitigation", label: "Alınacak önlem", type: "textarea" },
    { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(RISK_STATUS) },
  ],
  summary: (d) => (d.title as string) ?? "",
  detail: (d) =>
    joinDetail(
      labelOf(RISK_CATEGORY, d.category),
      d.likelihood && d.impact
        ? `Olasılık: ${labelOf(RISK_LEVEL, d.likelihood)} · Etki: ${labelOf(RISK_LEVEL, d.impact)}`
        : undefined,
      labelOf(RISK_STATUS, d.status),
      d.owner as string
    ),
  computeStats: (records) => [
    { label: "Açık risk", value: String(countWhere(records, (d) => d.status !== "closed")) },
    // Yüksek olasılık + yüksek etki: acil müdahale gerektiren kadran.
    {
      label: "Kritik",
      value: String(countWhere(records, (d) => d.status !== "closed" && d.likelihood === "high" && d.impact === "high")),
    },
    { label: "Kapanan", value: String(countBy(records, "status", "closed")) },
  ],
};
