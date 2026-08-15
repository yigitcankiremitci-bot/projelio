import {
  NOTES_FIELD,
  countBy,
  countWhere,
  joinDetail,
  labelOf,
  opts,
  userField,
  type ModuleRecordConfig,
} from "./shared";

// BİLGİ TEKNOLOJİLERİ / YAZILIM departmanının modülleri.

// ============================================================ Yazılım / Araç Envanteri
// "Yazılım modülü" = kullanılan yazılım ve aboneliklerin envanteri.
// Geliştirilen ürünün kendisi Projelio'nun çekirdeğinde (projeler/görevler) yaşar.
const SOFTWARE_STATUS = { active: "Aktif", expiring: "Yakında yenilenecek", expired: "Süresi doldu" };

export const softwareConfig: ModuleRecordConfig = {
  periodKey: "renewalDate",
  title: "Yazılım / Araç Envanteri",
  addLabel: "Araç ekle",
  emptyLabel: "Henüz kayıtlı yazılım/araç yok.",
  fields: [
    { key: "toolName", label: "Yazılım / araç adı", type: "text", required: true },
    { key: "vendor", label: "Sağlayıcı", type: "text" },
    { key: "licenseType", label: "Lisans türü", type: "text", placeholder: "Örn. Yıllık, Kullanıcı başı" },
    { key: "renewalDate", label: "Yenileme tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "active", options: opts(SOFTWARE_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.toolName ?? ""}${d.vendor ? ` · ${d.vendor}` : ""}`,
  detail: (d) => joinDetail(labelOf(SOFTWARE_STATUS, d.status), d.renewalDate as string),
  computeStats: (records) => [
    { label: "Toplam araç", value: String(records.length) },
    { label: "Yenileme yaklaşan", value: String(countBy(records, "status", "expiring")) },
    { label: "Süresi dolan", value: String(countBy(records, "status", "expired")) },
  ],
};

// ============================================================ Donanım / Zimmet
// Demirbaş takibi + kime zimmetlendiği. "Zimmetli kişi" bugün serbest metin;
// gerçek kullanıcı referansı (user_ref) Faz 2'de gelecek.
const HARDWARE_TYPE = {
  computer: "Bilgisayar",
  phone: "Telefon",
  monitor: "Monitör",
  printer: "Yazıcı",
  network: "Ağ cihazı",
  other: "Diğer",
};
const HARDWARE_STATUS = { in_use: "Kullanımda", in_stock: "Depoda", service: "Serviste", retired: "Hurda" };

export const hardwareConfig: ModuleRecordConfig = {
  periodKey: "purchaseDate",
  title: "Donanım / Zimmet",
  addLabel: "Donanım ekle",
  emptyLabel: "Henüz donanım kaydı yok.",
  fields: [
    { key: "assetName", label: "Cihaz", type: "text", required: true, placeholder: "Örn. MacBook Pro 14" },
    { key: "assetType", label: "Tür", type: "select", defaultValue: "computer", options: opts(HARDWARE_TYPE) },
    { key: "serialNo", label: "Seri no", type: "text" },
    userField("assignedTo", "Zimmetli kişi"),
    { key: "purchaseDate", label: "Alım tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "in_use", options: opts(HARDWARE_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.assetName ?? ""}${d.assignedTo ? ` · ${d.assignedTo}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(HARDWARE_TYPE, d.assetType),
      labelOf(HARDWARE_STATUS, d.status),
      d.serialNo ? `SN: ${d.serialNo}` : undefined
    ),
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Kullanımda", value: String(countBy(records, "status", "in_use")) },
    { label: "Serviste", value: String(countBy(records, "status", "service")) },
  ],
};

// ============================================================ Ağ ve Güvenlik
// İki işi bir arada tutar: güvenlik olayları (bir şey oldu) ve periyodik
// kontroller (bir şey olmasın diye). Tür alanı ikisini ayırır.
const SECURITY_TYPE = {
  incident: "Güvenlik olayı",
  check: "Periyodik kontrol",
  vulnerability: "Zafiyet",
  backup: "Yedekleme",
  access: "Erişim yetkisi",
};
const SEVERITY = { low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" };
const SECURITY_STATUS = { open: "Açık", investigating: "İnceleniyor", closed: "Kapandı" };

export const networkSecurityConfig: ModuleRecordConfig = {
  periodKey: "detectedDate",
  title: "Ağ ve Güvenlik",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz güvenlik kaydı yok.",
  fields: [
    { key: "title", label: "Başlık", type: "text", required: true },
    { key: "type", label: "Tür", type: "select", defaultValue: "check", options: opts(SECURITY_TYPE) },
    { key: "severity", label: "Önem derecesi", type: "select", defaultValue: "medium", options: opts(SEVERITY) },
    { key: "detectedDate", label: "Tespit / kontrol tarihi", type: "date" },
    userField("owner", "Sorumlu"),
    { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(SECURITY_STATUS) },
    { key: "notes", label: "Bulgular / alınan aksiyon", type: "textarea" },
  ],
  summary: (d) => (d.title as string) ?? "",
  detail: (d) =>
    joinDetail(
      labelOf(SECURITY_TYPE, d.type),
      labelOf(SECURITY_STATUS, d.status),
      d.severity ? `Önem: ${labelOf(SEVERITY, d.severity)}` : undefined,
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
