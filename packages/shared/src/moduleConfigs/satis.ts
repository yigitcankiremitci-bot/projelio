// dil:anahtar-dosya
//
// Bu dosyadaki metinlerin tamamı arayüzde görünen etiket: modül başlıkları,
// alan adları, seçenek adları, boş durum cümleleri. Hepsi modül düzeyinde
// sabit olduğu için burada t() çağrılamıyor; Türkçe metin sözlük ANAHTARI
// olarak kalıyor ve çeviri render anında yapılıyor (bkz. ModuleRecordsPanel).
// Karşılıkları: apps/web/src/lib/i18n/en/moduller.ts

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
  userField,
  type ModuleRecordConfig,
} from "./shared";

// SATIŞ ve İŞ GELİŞTİRME departmanının modülleri.

// ============================================================ Satış planlama (B2B / B2C)
// Satış hunisi — A4 arketibinin referans modülü. Kanban görünümü, aşama geçiş
// kaydı ve konfigüre edilebilir aşamalar A4 motoruyla gelecek (Faz 6).
// Bugün aşama bir select alanı; huni sayıları göstergelerden okunuyor.
const SALES_CHANNEL = { b2b: "B2B", b2c: "B2C" };
const SALES_STAGE = {
  lead: "Potansiyel",
  contacted: "İletişim kuruldu",
  proposal: "Teklif verildi",
  negotiation: "Görüşme",
  won: "Kazanıldı",
  lost: "Kaybedildi",
};

const CLOSED_STAGES = ["won", "lost"];

export const salesPipelineConfig: ModuleRecordConfig = {
  periodKey: "expectedCloseDate",
  title: "Satış Planlama",
  addLabel: "Fırsat ekle",
  emptyLabel: "Henüz satış fırsatı yok.",
  fields: [
    { key: "opportunityName", label: "Fırsat", type: "text", required: true },
    partyField("customerName", "Müşteri"),
    { key: "channel", label: "Kanal", type: "select", defaultValue: "b2b", options: opts(SALES_CHANNEL) },
    currencyField("amount", "Beklenen tutar"),
    { key: "expectedCloseDate", label: "Beklenen kapanış", type: "date" },
    userField("owner", "Sorumlu"),
    { key: "stage", label: "Aşama", type: "select", defaultValue: "lead", options: opts(SALES_STAGE) },
    NOTES_FIELD,
  ],
  summary: (d) =>
    `${d.opportunityName ?? ""}${d.amount ? ` · ${fmtMoney(d.amount, d.currency)}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(SALES_STAGE, d.stage),
      d.customerName as string,
      labelOf(SALES_CHANNEL, d.channel),
      d.expectedCloseDate as string,
      d.owner as string
    ),
  computeStats: (records) => {
    const open = records.filter((r) => !CLOSED_STAGES.includes(r.data.stage as string));
    return [
      { label: "Açık fırsat", value: String(open.length) },
      ...moneyStats("Açık tutar", open),
      { label: "Kazanılan", value: String(countBy(records, "stage", "won")) },
    ];
  },
};

// ============================================================ Ortaklık ve Dağıtım
const PARTNER_TYPE = {
  dealer: "Bayi",
  distributor: "Distribütör",
  agency: "Acente",
  strategic: "Stratejik ortak",
  supply: "Tedarik ortağı",
};
const PARTNER_STATUS = { talking: "Görüşülüyor", active: "Aktif", paused: "Askıda", ended: "Sonlandı" };

export const partnershipConfig: ModuleRecordConfig = {
  periodKey: "startDate",
  title: "Ortaklık ve Dağıtım",
  addLabel: "Ortak ekle",
  emptyLabel: "Henüz ortaklık kaydı yok.",
  fields: [
    partyField("partnerName", "Ortak / bayi", { required: true, entityRole: "distributor" }),
    { key: "partnerType", label: "Tür", type: "select", defaultValue: "dealer", options: opts(PARTNER_TYPE) },
    { key: "region", label: "Bölge", type: "text", placeholder: "Örn. Ege, Marmara, Almanya" },
    { key: "contactInfo", label: "İletişim", type: "text" },
    { key: "commissionRate", label: "Komisyon (%)", type: "number" },
    { key: "startDate", label: "Başlangıç tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "talking", options: opts(PARTNER_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.partnerName ?? ""}${d.region ? ` · ${d.region}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(PARTNER_TYPE, d.partnerType),
      labelOf(PARTNER_STATUS, d.status),
      d.commissionRate ? `Komisyon %${d.commissionRate}` : undefined,
      d.contactInfo as string
    ),
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Aktif", value: String(countBy(records, "status", "active")) },
    { label: "Görüşülen", value: String(countBy(records, "status", "talking")) },
  ],
};

// ============================================================ Pazar ve araştırma
// Not: Pazarlama'daki "Rakip ve sektör analizi" ile örtüşüyor; ikisinin tek
// modülde birleştirilmesi öneriliyor (bkz. docs/moduller/01-modul-arketip-eslesmesi.md).
// Ayrımı korumak için bu modül *araştırma çalışmalarını*, diğeri *rakipleri* tutar.
const RESEARCH_TYPE = {
  market_size: "Pazar büyüklüğü",
  customer_survey: "Müşteri anketi",
  pricing: "Fiyat araştırması",
  trend: "Trend analizi",
  competitor: "Rakip incelemesi",
};
const RESEARCH_STATUS = { planned: "Planlandı", ongoing: "Devam ediyor", done: "Tamamlandı" };

export const marketResearchConfig: ModuleRecordConfig = {
  periodKey: "conductedDate",
  title: "Pazar ve Araştırma",
  addLabel: "Araştırma ekle",
  emptyLabel: "Henüz araştırma kaydı yok.",
  fields: [
    { key: "title", label: "Araştırma", type: "text", required: true },
    { key: "researchType", label: "Tür", type: "select", defaultValue: "market_size", options: opts(RESEARCH_TYPE) },
    { key: "region", label: "Bölge / pazar", type: "text" },
    { key: "conductedDate", label: "Tarih", type: "date" },
    { key: "findings", label: "Bulgular", type: "textarea" },
    { key: "status", label: "Durum", type: "select", defaultValue: "planned", options: opts(RESEARCH_STATUS) },
  ],
  summary: (d) => `${d.title ?? ""}${d.region ? ` · ${d.region}` : ""}`,
  detail: (d) => joinDetail(labelOf(RESEARCH_TYPE, d.researchType), labelOf(RESEARCH_STATUS, d.status), d.conductedDate as string),
  computeStats: (records) => [
    { label: "Araştırma", value: String(records.length) },
    { label: "Devam eden", value: String(countWhere(records, (d) => d.status === "ongoing")) },
    { label: "Tamamlanan", value: String(countBy(records, "status", "done")) },
  ],
};
