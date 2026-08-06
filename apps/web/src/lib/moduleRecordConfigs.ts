import type { ModuleRecord } from "@projelio/shared";

// Tam özellikli hale getirilen modüllerin alan tanımları. Yeni bir modülü tam
// özellikli yapmak için (backend/DB değişikliği gerekmeden) buraya yeni bir
// giriş eklemek yeterli — ModuleRecordsPanel bu tanıma göre form + liste + (varsa)
// özet gösterge üretir.
// Not: "Müşteri Modülü" hem Müşteri İlişkileri (mid_musteri_modulu) hem Satış ve
// İş Geliştirme (spd_musteri_modulu) departmanlarının kataloğunda aynı isimle
// geçiyor — ikisi de aynı yapılandırmayı (aynı module_key ile ayrı ayrı kayıt) kullanır.

export type ModuleFieldType = "text" | "textarea" | "number" | "date" | "select";

export interface ModuleFieldOption {
  value: string;
  label: string;
}

export interface ModuleFieldConfig {
  key: string;
  label: string;
  type: ModuleFieldType;
  required?: boolean;
  options?: ModuleFieldOption[];
  defaultValue?: string;
  placeholder?: string;
}

export interface ModuleSummaryStat {
  label: string;
  value: string;
}

export interface ModuleRecordConfig {
  title: string;
  addLabel: string;
  emptyLabel: string;
  fields: ModuleFieldConfig[];
  // Liste satırında kalın gösterilecek özet (örn. "+ 1.250,00 TRY · Kira").
  summary: (data: Record<string, unknown>) => string;
  // İkinci satır (opsiyonel, daha soluk gösterilir).
  detail?: (data: Record<string, unknown>) => string | undefined;
  // Modülün ana ekranında listenin üstünde gösterilen gösterge/özet kutucukları
  // (örn. "Net bakiye", "Açık şikayet sayısı").
  computeStats?: (records: ModuleRecord[]) => ModuleSummaryStat[];
}

function fmtMoney(amount: unknown, currency: unknown): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return "";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: (currency as string) || "TRY" }).format(n);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

function countBy(records: ModuleRecord[], field: string, value: string): number {
  return records.filter((r) => r.data[field] === value).length;
}

const CURRENCY_FIELD: ModuleFieldConfig = {
  key: "currency",
  label: "Para birimi",
  type: "select",
  defaultValue: "TRY",
  options: [
    { value: "TRY", label: "TRY" },
    { value: "USD", label: "USD" },
    { value: "EUR", label: "EUR" },
  ],
};

// ============================================================ Gelir-Gider (Finans Muhasebe)
const financeEntryConfig: ModuleRecordConfig = {
  title: "Gelir-Gider",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz gelir/gider kaydı yok.",
  fields: [
    {
      key: "type",
      label: "Tür",
      type: "select",
      required: true,
      defaultValue: "income",
      options: [
        { value: "income", label: "Gelir" },
        { value: "expense", label: "Gider" },
      ],
    },
    { key: "amount", label: "Tutar", type: "number", required: true },
    CURRENCY_FIELD,
    { key: "category", label: "Kategori", type: "text", placeholder: "Örn. Kira, Yazılım, Satış" },
    { key: "entryDate", label: "Tarih", type: "date" },
    { key: "description", label: "Açıklama", type: "textarea" },
  ],
  summary: (d) => `${d.type === "expense" ? "− " : "+ "}${fmtMoney(d.amount, d.currency)}${d.category ? ` · ${d.category}` : ""}`,
  detail: (d) => [d.entryDate as string | undefined, d.description as string | undefined].filter(Boolean).join(" · ") || undefined,
  computeStats: (records) => {
    const totals = new Map<string, number>();
    for (const r of records) {
      const currency = (r.data.currency as string) || "TRY";
      const amount = Number(r.data.amount) || 0;
      const signed = r.data.type === "expense" ? -amount : amount;
      totals.set(currency, (totals.get(currency) ?? 0) + signed);
    }
    if (totals.size === 0) return [{ label: "Kayıt", value: "0" }];
    return Array.from(totals.entries()).map(([currency, net]) => ({ label: `Net bakiye (${currency})`, value: fmtMoney(net, currency) }));
  },
};

// ============================================================ Alacak-Borç (Finans Muhasebe)
// Şirket Bütçe sekmesindeki gelir/gider defterinden ayrı: burada henüz TAHSİL
// EDİLMEMİŞ/ÖDENMEMİŞ tutarlar (kimden alacaklısın, kime borçlusun) takip edilir —
// vade tarihi ve açık/kapandı durumuyla (bkz. OrgBudgetPanel).
const receivablesPayablesConfig: ModuleRecordConfig = {
  title: "Alacak-Borç",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz alacak/borç kaydı yok.",
  fields: [
    {
      key: "type",
      label: "Tür",
      type: "select",
      required: true,
      defaultValue: "receivable",
      options: [
        { value: "receivable", label: "Alacak" },
        { value: "payable", label: "Borç" },
      ],
    },
    { key: "counterparty", label: "Kimden / Kime", type: "text", required: true, placeholder: "Örn. ABC Ltd." },
    { key: "amount", label: "Tutar", type: "number", required: true },
    CURRENCY_FIELD,
    { key: "category", label: "Kategori", type: "text", placeholder: "Örn. Satış, Kira, Hizmet" },
    { key: "dueDate", label: "Vade tarihi", type: "date" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "open",
      options: [
        { value: "open", label: "Açık" },
        { value: "settled", label: "Kapandı" },
      ],
    },
    { key: "description", label: "Açıklama", type: "textarea" },
  ],
  summary: (d) =>
    `${d.type === "payable" ? "Borç" : "Alacak"} · ${d.counterparty ?? ""} · ${fmtMoney(d.amount, d.currency)}`,
  detail: (d) => {
    const statusLabel = d.status === "settled" ? (d.type === "payable" ? "Ödendi" : "Tahsil edildi") : "Açık";
    return [statusLabel, d.dueDate as string | undefined, d.category as string | undefined].filter(Boolean).join(" · ") || undefined;
  },
  computeStats: (records) => {
    // Farklı para birimlerini toplamamak için her ikisi de para birimine göre
    // gruplanır (bkz. financeEntryConfig.computeStats'taki aynı yaklaşım).
    const sumByCurrency = (rows: ModuleRecord[]) => {
      const totals = new Map<string, number>();
      for (const r of rows) {
        const currency = (r.data.currency as string) || "TRY";
        totals.set(currency, (totals.get(currency) ?? 0) + (Number(r.data.amount) || 0));
      }
      return totals;
    };
    const openReceivable = sumByCurrency(records.filter((r) => r.data.type !== "payable" && r.data.status !== "settled"));
    const openPayable = sumByCurrency(records.filter((r) => r.data.type === "payable" && r.data.status !== "settled"));

    if (openReceivable.size === 0 && openPayable.size === 0) {
      return [
        { label: "Açık alacak", value: fmtMoney(0, "TRY") },
        { label: "Açık borç", value: fmtMoney(0, "TRY") },
      ];
    }
    const stats: ModuleSummaryStat[] = [];
    for (const [currency, sum] of openReceivable) stats.push({ label: `Açık alacak (${currency})`, value: fmtMoney(sum, currency) });
    for (const [currency, sum] of openPayable) stats.push({ label: `Açık borç (${currency})`, value: fmtMoney(sum, currency) });
    return stats;
  },
};

// ============================================================ Fatura (Finans Muhasebe)
const invoiceConfig: ModuleRecordConfig = {
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
      options: [
        { value: "issued", label: "Kesilen" },
        { value: "received", label: "Alınan" },
      ],
    },
    { key: "counterpartyName", label: "Müşteri / Tedarikçi", type: "text", required: true },
    { key: "invoiceNo", label: "Fatura no", type: "text" },
    { key: "amount", label: "Tutar", type: "number", required: true },
    CURRENCY_FIELD,
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "pending",
      options: [
        { value: "pending", label: "Bekliyor" },
        { value: "paid", label: "Ödendi" },
      ],
    },
    { key: "issueDate", label: "Tarih", type: "date" },
  ],
  summary: (d) => `${d.counterpartyName ?? ""} · ${fmtMoney(d.amount, d.currency)}`,
  detail: (d) => {
    const dir = d.direction === "received" ? "Alınan" : "Kesilen";
    const status = d.status === "paid" ? "Ödendi" : "Bekliyor";
    const no = d.invoiceNo ? `#${d.invoiceNo} · ` : "";
    return `${no}${dir} · ${status}${d.issueDate ? ` · ${d.issueDate}` : ""}`;
  },
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Bekleyen", value: String(countBy(records, "status", "pending")) },
    { label: "Ödenen", value: String(countBy(records, "status", "paid")) },
  ],
};

// ============================================================ Müşteri (Müşteri İlişkileri / Satış)
const customerConfig: ModuleRecordConfig = {
  title: "Müşteriler",
  addLabel: "Müşteri ekle",
  emptyLabel: "Henüz müşteri kaydı yok.",
  fields: [
    { key: "name", label: "İsim", type: "text", required: true },
    { key: "contact", label: "İletişim (telefon/e-posta)", type: "text" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "lead",
      options: [
        { value: "lead", label: "Aday" },
        { value: "active", label: "Aktif" },
        { value: "inactive", label: "Pasif" },
      ],
    },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => (d.name as string) ?? "",
  detail: (d) => {
    const statusLabel = d.status === "active" ? "Aktif" : d.status === "inactive" ? "Pasif" : "Aday";
    return [statusLabel, d.contact as string | undefined].filter(Boolean).join(" · ") || undefined;
  },
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Aktif", value: String(countBy(records, "status", "active")) },
    { label: "Aday", value: String(countBy(records, "status", "lead")) },
  ],
};

// ============================================================ İşe Alım ve Oryantasyon (İK)
const candidateConfig: ModuleRecordConfig = {
  title: "İşe Alım",
  addLabel: "Aday ekle",
  emptyLabel: "Henüz aday kaydı yok.",
  fields: [
    { key: "position", label: "Pozisyon", type: "text", required: true },
    { key: "candidateName", label: "Aday adı", type: "text", required: true },
    {
      key: "stage",
      label: "Aşama",
      type: "select",
      defaultValue: "interview",
      options: [
        { value: "interview", label: "Mülakat" },
        { value: "offer", label: "Teklif" },
        { value: "hired", label: "İşe alındı" },
        { value: "rejected", label: "Reddedildi" },
      ],
    },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => `${d.candidateName ?? ""} · ${d.position ?? ""}`,
  detail: (d) => {
    const stageLabel: Record<string, string> = { interview: "Mülakat", offer: "Teklif", hired: "İşe alındı", rejected: "Reddedildi" };
    return stageLabel[d.stage as string] ?? undefined;
  },
  computeStats: (records) => [
    { label: "Süreçte", value: String(countBy(records, "stage", "interview") + countBy(records, "stage", "offer")) },
    { label: "İşe alınan", value: String(countBy(records, "stage", "hired")) },
    { label: "Reddedilen", value: String(countBy(records, "stage", "rejected")) },
  ],
};

// ============================================================ Sözleşme (Hukuk ve Uyum)
const contractConfig: ModuleRecordConfig = {
  title: "Sözleşmeler",
  addLabel: "Sözleşme ekle",
  emptyLabel: "Henüz sözleşme kaydı yok.",
  fields: [
    { key: "counterpartyName", label: "Karşı taraf", type: "text", required: true },
    { key: "contractType", label: "Sözleşme türü", type: "text", placeholder: "Örn. Hizmet, Kira, Tedarik" },
    { key: "startDate", label: "Başlangıç tarihi", type: "date" },
    { key: "endDate", label: "Bitiş tarihi", type: "date" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "active",
      options: [
        { value: "active", label: "Aktif" },
        { value: "expired", label: "Süresi doldu" },
        { value: "cancelled", label: "İptal edildi" },
      ],
    },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => `${d.counterpartyName ?? ""}${d.contractType ? ` · ${d.contractType}` : ""}`,
  detail: (d) => {
    const statusLabel: Record<string, string> = { active: "Aktif", expired: "Süresi doldu", cancelled: "İptal edildi" };
    const range = [d.startDate, d.endDate].filter(Boolean).join(" → ");
    return [statusLabel[d.status as string], range || undefined].filter(Boolean).join(" · ") || undefined;
  },
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Aktif", value: String(countBy(records, "status", "active")) },
    { label: "Süresi dolan", value: String(countBy(records, "status", "expired")) },
  ],
};

// ============================================================ Şikayet ve Öneri (Müşteri İlişkileri)
const complaintConfig: ModuleRecordConfig = {
  title: "Şikayet ve Öneri",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz şikayet/öneri kaydı yok.",
  fields: [
    {
      key: "type",
      label: "Tür",
      type: "select",
      defaultValue: "complaint",
      options: [
        { value: "complaint", label: "Şikayet" },
        { value: "suggestion", label: "Öneri" },
      ],
    },
    { key: "customerName", label: "Müşteri adı", type: "text" },
    { key: "description", label: "Açıklama", type: "textarea", required: true },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "open",
      options: [
        { value: "open", label: "Açık" },
        { value: "resolved", label: "Çözüldü" },
      ],
    },
    { key: "date", label: "Tarih", type: "date" },
  ],
  summary: (d) => `${d.type === "suggestion" ? "Öneri" : "Şikayet"}${d.customerName ? ` · ${d.customerName}` : ""}`,
  detail: (d) => (d.status === "resolved" ? "Çözüldü" : "Açık"),
  computeStats: (records) => [
    { label: "Açık şikayet", value: String(records.filter((r) => r.data.type !== "suggestion" && r.data.status === "open").length) },
    { label: "Çözülen", value: String(countBy(records, "status", "resolved")) },
    { label: "Öneri", value: String(countBy(records, "type", "suggestion")) },
  ],
};

// ============================================================ Tedarik (Operasyon/Üretim)
const procurementConfig: ModuleRecordConfig = {
  title: "Tedarik",
  addLabel: "Talep ekle",
  emptyLabel: "Henüz tedarik kaydı yok.",
  fields: [
    { key: "itemName", label: "Ürün / Hizmet", type: "text", required: true },
    { key: "supplierName", label: "Tedarikçi", type: "text" },
    { key: "quantity", label: "Miktar", type: "number" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "requested",
      options: [
        { value: "requested", label: "Talep edildi" },
        { value: "ordered", label: "Sipariş verildi" },
        { value: "received", label: "Teslim alındı" },
      ],
    },
    { key: "expectedDate", label: "Beklenen tarih", type: "date" },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => `${d.itemName ?? ""}${d.quantity ? ` · ${d.quantity} adet` : ""}`,
  detail: (d) => {
    const statusLabel: Record<string, string> = { requested: "Talep edildi", ordered: "Sipariş verildi", received: "Teslim alındı" };
    return [d.supplierName as string | undefined, statusLabel[d.status as string]].filter(Boolean).join(" · ") || undefined;
  },
  computeStats: (records) => [
    { label: "Bekleyen", value: String(countBy(records, "status", "requested") + countBy(records, "status", "ordered")) },
    { label: "Teslim alınan", value: String(countBy(records, "status", "received")) },
  ],
};

// ============================================================ Yazılım/Araç Envanteri (BT/Yazılım)
const softwareConfig: ModuleRecordConfig = {
  title: "Yazılım / Araç Envanteri",
  addLabel: "Araç ekle",
  emptyLabel: "Henüz kayıtlı yazılım/araç yok.",
  fields: [
    { key: "toolName", label: "Yazılım / araç adı", type: "text", required: true },
    { key: "vendor", label: "Sağlayıcı", type: "text" },
    { key: "licenseType", label: "Lisans türü", type: "text", placeholder: "Örn. Yıllık, Kullanıcı başı" },
    { key: "renewalDate", label: "Yenileme tarihi", type: "date" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "active",
      options: [
        { value: "active", label: "Aktif" },
        { value: "expiring", label: "Yakında yenilenecek" },
        { value: "expired", label: "Süresi doldu" },
      ],
    },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => `${d.toolName ?? ""}${d.vendor ? ` · ${d.vendor}` : ""}`,
  detail: (d) => {
    const statusLabel: Record<string, string> = { active: "Aktif", expiring: "Yakında yenilenecek", expired: "Süresi doldu" };
    return [statusLabel[d.status as string], d.renewalDate as string | undefined].filter(Boolean).join(" · ") || undefined;
  },
  computeStats: (records) => [
    { label: "Toplam araç", value: String(records.length) },
    { label: "Yenileme yaklaşan", value: String(countBy(records, "status", "expiring")) },
    { label: "Süresi dolan", value: String(countBy(records, "status", "expired")) },
  ],
};

// ============================================================ Sosyal Medya (Pazarlama ve Büyüme)
const socialMediaConfig: ModuleRecordConfig = {
  title: "Sosyal Medya",
  addLabel: "Gönderi ekle",
  emptyLabel: "Henüz planlanmış gönderi yok.",
  fields: [
    {
      key: "platform",
      label: "Platform",
      type: "select",
      defaultValue: "instagram",
      options: [
        { value: "instagram", label: "Instagram" },
        { value: "facebook", label: "Facebook" },
        { value: "twitter", label: "X / Twitter" },
        { value: "linkedin", label: "LinkedIn" },
        { value: "tiktok", label: "TikTok" },
        { value: "youtube", label: "YouTube" },
        { value: "other", label: "Diğer" },
      ],
    },
    { key: "title", label: "Başlık / konu", type: "text", required: true },
    { key: "scheduledDate", label: "Planlanan tarih", type: "date" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "draft",
      options: [
        { value: "draft", label: "Taslak" },
        { value: "scheduled", label: "Planlandı" },
        { value: "published", label: "Yayınlandı" },
      ],
    },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => `${d.title ?? ""}`,
  detail: (d) => {
    const platformLabel: Record<string, string> = {
      instagram: "Instagram",
      facebook: "Facebook",
      twitter: "X / Twitter",
      linkedin: "LinkedIn",
      tiktok: "TikTok",
      youtube: "YouTube",
      other: "Diğer",
    };
    const statusLabel: Record<string, string> = { draft: "Taslak", scheduled: "Planlandı", published: "Yayınlandı" };
    return [platformLabel[d.platform as string], statusLabel[d.status as string], d.scheduledDate as string | undefined]
      .filter(Boolean)
      .join(" · ") || undefined;
  },
  computeStats: (records) => [
    { label: "Taslak", value: String(countBy(records, "status", "draft")) },
    { label: "Planlanan", value: String(countBy(records, "status", "scheduled")) },
    { label: "Yayınlanan", value: String(countBy(records, "status", "published")) },
  ],
};

// ============================================================ Hedef Belirleme (YÖNETİM)
const goalConfig: ModuleRecordConfig = {
  title: "Hedefler",
  addLabel: "Hedef ekle",
  emptyLabel: "Henüz hedef tanımlanmadı.",
  fields: [
    { key: "title", label: "Hedef", type: "text", required: true },
    { key: "owner", label: "Sorumlu", type: "text" },
    { key: "targetDate", label: "Hedef tarih", type: "date" },
    {
      key: "status",
      label: "Durum",
      type: "select",
      defaultValue: "not_started",
      options: [
        { value: "not_started", label: "Başlanmadı" },
        { value: "in_progress", label: "Devam ediyor" },
        { value: "done", label: "Tamamlandı" },
      ],
    },
    { key: "notes", label: "Not", type: "textarea" },
  ],
  summary: (d) => (d.title as string) ?? "",
  detail: (d) => {
    const statusLabel: Record<string, string> = { not_started: "Başlanmadı", in_progress: "Devam ediyor", done: "Tamamlandı" };
    return [d.owner as string | undefined, statusLabel[d.status as string]].filter(Boolean).join(" · ") || undefined;
  },
  computeStats: (records) => [
    { label: "Devam eden", value: String(countBy(records, "status", "in_progress")) },
    { label: "Tamamlanan", value: String(countBy(records, "status", "done")) },
    { label: "Toplam", value: String(records.length) },
  ],
};

export const MODULE_RECORD_CONFIGS: Record<string, ModuleRecordConfig> = {
  fm_gelir_gider: financeEntryConfig,
  fm_alacak_borc: receivablesPayablesConfig,
  fm_fatura: invoiceConfig,
  mid_musteri_modulu: customerConfig,
  spd_musteri_modulu: customerConfig,
  ik_ise_alim_oryantasyon: candidateConfig,
  hud_sozlesme: contractConfig,
  mid_sikayet_oneri: complaintConfig,
  oud_tedarik: procurementConfig,
  bt_yazilim: softwareConfig,
  pd_sosyal_medya: socialMediaConfig,
  yonetim_hedef_belirleme: goalConfig,
};
