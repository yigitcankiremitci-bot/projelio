import { NOTES_FIELD, countBy, countWhere, joinDetail, labelOf, opts, type ModuleRecordConfig } from "./shared";

// OPERASYON / ÜRETİM departmanının modülleri.
//
// Tedarik → Depo → Sevkiyat bu ürünün en güçlü "modüller birbirini besliyor"
// zinciri. Bugün üçü de bağımsız kayıt defteri; otomatik stok hareketi üretimi
// (tedarik teslim alınınca giriş, sevkiyat çıkınca çıkış) Faz 6'ya ait.
// Bkz. docs/moduller/01-modul-arketip-eslesmesi.md

// ============================================================ Tedarik
const PROCUREMENT_STATUS = { requested: "Talep edildi", ordered: "Sipariş verildi", received: "Teslim alındı" };

export const procurementConfig: ModuleRecordConfig = {
  title: "Tedarik",
  addLabel: "Talep ekle",
  emptyLabel: "Henüz tedarik kaydı yok.",
  fields: [
    { key: "itemName", label: "Ürün / Hizmet", type: "text", required: true },
    { key: "supplierName", label: "Tedarikçi", type: "text" },
    { key: "quantity", label: "Miktar", type: "number" },
    { key: "status", label: "Durum", type: "select", defaultValue: "requested", options: opts(PROCUREMENT_STATUS) },
    { key: "expectedDate", label: "Beklenen tarih", type: "date" },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.itemName ?? ""}${d.quantity ? ` · ${d.quantity} adet` : ""}`,
  detail: (d) => joinDetail(d.supplierName as string, labelOf(PROCUREMENT_STATUS, d.status)),
  computeStats: (records) => [
    {
      label: "Bekleyen",
      value: String(countBy(records, "status", "requested") + countBy(records, "status", "ordered")),
    },
    { label: "Teslim alınan", value: String(countBy(records, "status", "received")) },
  ],
};

// ============================================================ Depo
// A3 (envanter) arketibinin tek örneği. Tam karşılığında bakiye yazılmaz,
// hareketlerden (giriş/çıkış/sayım) türetilir — o motor Faz 6'da gelecek.
// Bugün miktar doğrudan tutuluyor; kritik seviye uyarısı bu haliyle de çalışır.
const UNIT = { piece: "Adet", kg: "Kg", lt: "Litre", m: "Metre", box: "Kutu", pack: "Paket" };

export const warehouseConfig: ModuleRecordConfig = {
  title: "Depo",
  addLabel: "Kalem ekle",
  emptyLabel: "Henüz stok kalemi yok.",
  fields: [
    { key: "itemName", label: "Ürün / malzeme", type: "text", required: true },
    { key: "sku", label: "Stok kodu", type: "text" },
    { key: "quantity", label: "Mevcut miktar", type: "number", required: true },
    { key: "unit", label: "Birim", type: "select", defaultValue: "piece", options: opts(UNIT) },
    { key: "criticalLevel", label: "Kritik seviye", type: "number", placeholder: "Bu miktarın altına düşerse uyarılır" },
    { key: "location", label: "Konum / raf", type: "text" },
    { key: "lastCountDate", label: "Son sayım tarihi", type: "date" },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.itemName ?? ""} · ${d.quantity ?? 0} ${labelOf(UNIT, d.unit) ?? ""}`.trim(),
  detail: (d) =>
    joinDetail(
      d.sku ? `Kod: ${d.sku}` : undefined,
      d.location as string,
      d.lastCountDate ? `Son sayım: ${d.lastCountDate}` : undefined
    ),
  computeStats: (records) => {
    const isCritical = (d: Record<string, unknown>) => {
      const critical = Number(d.criticalLevel);
      if (!Number.isFinite(critical) || critical <= 0) return false;
      return (Number(d.quantity) || 0) <= critical;
    };
    return [
      { label: "Kalem", value: String(records.length) },
      { label: "Kritik seviyede", value: String(countWhere(records, isCritical)) },
      { label: "Stoksuz", value: String(countWhere(records, (d) => (Number(d.quantity) || 0) <= 0)) },
    ];
  },
};

// ============================================================ Sevkiyat yönetimi
const SHIPMENT_STATUS = {
  preparing: "Hazırlanıyor",
  shipped: "Yola çıktı",
  delivered: "Teslim edildi",
  returned: "İade",
  cancelled: "İptal",
};

export const shipmentConfig: ModuleRecordConfig = {
  title: "Sevkiyat",
  addLabel: "Sevkiyat ekle",
  emptyLabel: "Henüz sevkiyat kaydı yok.",
  fields: [
    { key: "customerName", label: "Müşteri / alıcı", type: "text", required: true },
    { key: "shipmentNo", label: "Sevkiyat no", type: "text" },
    { key: "itemSummary", label: "Gönderilen", type: "text", placeholder: "Örn. 3 koli, 12 adet" },
    { key: "shipDate", label: "Çıkış tarihi", type: "date" },
    { key: "carrier", label: "Taşıyıcı / kargo", type: "text" },
    { key: "trackingNo", label: "Takip no", type: "text" },
    { key: "status", label: "Durum", type: "select", defaultValue: "preparing", options: opts(SHIPMENT_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.customerName ?? ""}${d.shipmentNo ? ` · #${d.shipmentNo}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(SHIPMENT_STATUS, d.status),
      d.itemSummary as string,
      d.carrier as string,
      d.trackingNo ? `Takip: ${d.trackingNo}` : undefined,
      d.shipDate as string
    ),
  computeStats: (records) => [
    { label: "Hazırlanan", value: String(countBy(records, "status", "preparing")) },
    { label: "Yolda", value: String(countBy(records, "status", "shipped")) },
    { label: "Teslim edilen", value: String(countBy(records, "status", "delivered")) },
  ],
};

// ============================================================ Kalite kontrol
// Uygunsuzluk → düzeltici aksiyon → doğrulama → kapatma döngüsü (ISO 9001 deseni).
const QUALITY_TYPE = {
  nonconformity: "Uygunsuzluk",
  customer_complaint: "Müşteri şikayeti",
  internal_audit: "İç denetim",
  improvement: "Süreç iyileştirme",
};
const QUALITY_SEVERITY = { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" };
const QUALITY_STATUS = {
  open: "Açık",
  action_taken: "Aksiyon alındı",
  verifying: "Doğrulanıyor",
  closed: "Kapandı",
};

export const qualityControlConfig: ModuleRecordConfig = {
  title: "Kalite Kontrol",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz kalite kaydı yok.",
  fields: [
    { key: "title", label: "Konu", type: "text", required: true },
    { key: "relatedItem", label: "İlgili ürün / süreç", type: "text" },
    { key: "issueType", label: "Tür", type: "select", defaultValue: "nonconformity", options: opts(QUALITY_TYPE) },
    { key: "severity", label: "Önem derecesi", type: "select", defaultValue: "medium", options: opts(QUALITY_SEVERITY) },
    { key: "detectedDate", label: "Tespit tarihi", type: "date" },
    { key: "correctiveAction", label: "Düzeltici aksiyon", type: "textarea" },
    { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(QUALITY_STATUS) },
  ],
  summary: (d) => `${d.title ?? ""}${d.relatedItem ? ` · ${d.relatedItem}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(QUALITY_TYPE, d.issueType),
      labelOf(QUALITY_STATUS, d.status),
      d.severity ? `Önem: ${labelOf(QUALITY_SEVERITY, d.severity)}` : undefined,
      d.detectedDate as string
    ),
  computeStats: (records) => [
    { label: "Açık", value: String(countWhere(records, (d) => d.status !== "closed")) },
    {
      label: "Kritik / yüksek",
      value: String(
        countWhere(records, (d) => d.status !== "closed" && (d.severity === "critical" || d.severity === "high"))
      ),
    },
    { label: "Kapanan", value: String(countBy(records, "status", "closed")) },
  ],
};
