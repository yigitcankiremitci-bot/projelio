import {
  NOTES_FIELD,
  countBy,
  countWhere,
  daysFromNow,
  joinDetail,
  labelOf,
  opts,
  partyField,
  todayISO,
  type ModuleRecordConfig,
} from "./shared";

// HUKUK ve UYUM departmanının modülleri.
// Üçü de belge odaklı kayıt defteri (A2): taraf, tarih, durum, ek.

// ============================================================ Sözleşme
const CONTRACT_STATUS = { active: "Aktif", expired: "Süresi doldu", cancelled: "İptal edildi" };

export const contractConfig: ModuleRecordConfig = {
  periodKey: "startDate",
  title: "Sözleşmeler",
  addLabel: "Sözleşme ekle",
  emptyLabel: "Henüz sözleşme kaydı yok.",
  fields: [
    partyField("counterpartyName", "Karşı taraf", { required: true }),
    { key: "contractType", label: "Sözleşme türü", type: "text", placeholder: "Örn. Hizmet, Kira, Tedarik" },
    { key: "startDate", label: "Başlangıç tarihi", type: "date" },
    { key: "endDate", label: "Bitiş tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "active", options: opts(CONTRACT_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.counterpartyName ?? ""}${d.contractType ? ` · ${d.contractType}` : ""}`,
  detail: (d) => {
    const range = [d.startDate, d.endDate].filter(Boolean).join(" → ");
    return joinDetail(labelOf(CONTRACT_STATUS, d.status), range || undefined);
  },
  computeStats: (records) => {
    // Bitişine 30 günden az kalan aktif sözleşmeler: yenileme kaçırılmasın.
    const todayStr = todayISO();
    const soon = daysFromNow(30);
    return [
      { label: "Aktif", value: String(countBy(records, "status", "active")) },
      {
        label: "Bitişi yaklaşan",
        value: String(
          countWhere(
            records,
            (d) => d.status === "active" && typeof d.endDate === "string" && d.endDate >= todayStr && d.endDate <= soon
          )
        ),
      },
      { label: "Süresi dolan", value: String(countBy(records, "status", "expired")) },
    ];
  },
};

// ============================================================ Marka / Patent / Telif
// Yenileme tarihi bu modülün omurgası: tescil kaçırılırsa hak kaybedilir.
const IP_TYPE = {
  trademark: "Marka",
  patent: "Patent",
  utility: "Faydalı model",
  design: "Tasarım",
  copyright: "Telif",
  domain: "Alan adı",
};
const IP_STATUS = {
  applied: "Başvuruldu",
  registered: "Tescilli",
  renewal_due: "Yenilenmeli",
  expired: "Süresi doldu",
  rejected: "Reddedildi",
};

export const intellectualPropertyConfig: ModuleRecordConfig = {
  periodKey: "applicationDate",
  title: "Marka / Patent / Telif",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz fikri mülkiyet kaydı yok.",
  fields: [
    { key: "title", label: "Ad", type: "text", required: true },
    { key: "ipType", label: "Tür", type: "select", required: true, defaultValue: "trademark", options: opts(IP_TYPE) },
    { key: "registrationNo", label: "Tescil / başvuru no", type: "text" },
    { key: "applicationDate", label: "Başvuru tarihi", type: "date" },
    { key: "renewalDate", label: "Yenileme tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "applied", options: opts(IP_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.title ?? ""}${d.ipType ? ` · ${labelOf(IP_TYPE, d.ipType)}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(IP_STATUS, d.status),
      d.registrationNo ? `No: ${d.registrationNo}` : undefined,
      d.renewalDate ? `Yenileme: ${d.renewalDate}` : undefined
    ),
  computeStats: (records) => {
    const todayStr = todayISO();
    // Fikri mülkiyette yenileme penceresi sözleşmeden geniş tutulur (90 gün) —
    // tescil yenileme süreçleri bürokratik olarak uzun sürer.
    const soon = daysFromNow(90);
    return [
      { label: "Tescilli", value: String(countBy(records, "status", "registered")) },
      {
        label: "Yenileme yaklaşan",
        value: String(
          countWhere(
            records,
            (d) =>
              d.status !== "expired" &&
              d.status !== "rejected" &&
              typeof d.renewalDate === "string" &&
              d.renewalDate >= todayStr &&
              d.renewalDate <= soon
          )
        ),
      },
      { label: "Başvuru sürecinde", value: String(countBy(records, "status", "applied")) },
    ];
  },
};

// ============================================================ Mevzuatlar
// Referans kütüphanesi: şirketi bağlayan düzenlemeler ve uyum durumu.
const RELEVANCE = { high: "Yüksek", medium: "Orta", low: "Düşük" };
const COMPLIANCE = { compliant: "Uyumlu", gap: "Eksik var", reviewing: "İnceleniyor" };

export const regulationConfig: ModuleRecordConfig = {
  periodKey: "effectiveDate",
  title: "Mevzuatlar",
  addLabel: "Mevzuat ekle",
  emptyLabel: "Henüz mevzuat kaydı yok.",
  fields: [
    { key: "title", label: "Mevzuat / düzenleme", type: "text", required: true },
    { key: "authority", label: "Kurum", type: "text", placeholder: "Örn. KVKK, SGK, Ticaret Bakanlığı" },
    { key: "regulationNo", label: "Sayı / numara", type: "text" },
    { key: "effectiveDate", label: "Yürürlük tarihi", type: "date" },
    { key: "relevance", label: "Bizim için önemi", type: "select", defaultValue: "medium", options: opts(RELEVANCE) },
    {
      key: "complianceStatus",
      label: "Uyum durumu",
      type: "select",
      defaultValue: "reviewing",
      options: opts(COMPLIANCE),
    },
    { key: "notes", label: "Gereklilikler / notlar", type: "textarea" },
  ],
  summary: (d) => `${d.title ?? ""}${d.authority ? ` · ${d.authority}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(COMPLIANCE, d.complianceStatus),
      d.relevance ? `Önem: ${labelOf(RELEVANCE, d.relevance)}` : undefined,
      d.effectiveDate as string
    ),
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    // Uyum eksiği olan yüksek önemli mevzuatlar en riskli grup.
    { label: "Eksik var", value: String(countBy(records, "complianceStatus", "gap")) },
    { label: "Uyumlu", value: String(countBy(records, "complianceStatus", "compliant")) },
  ],
};
