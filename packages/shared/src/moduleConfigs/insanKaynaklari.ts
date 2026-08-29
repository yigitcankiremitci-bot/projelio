import {
  NOTES_FIELD,
  countBy,
  countWhere,
  currencyField,
  joinDetail,
  labelOf,
  moneyStats,
  opts,
  userField,
  type ModuleRecordConfig,
} from "./shared";

// İNSAN KAYNAKLARI departmanının modülleri.

// ============================================================ İşe alım ve oryantasyon
// Aşamalı süreç (A4): kanban görünümü A4 motoruyla gelecek, bugün liste + aşama alanı.
const CANDIDATE_STAGE = {
  interview: "Mülakat",
  offer: "Teklif",
  hired: "İşe alındı",
  rejected: "Reddedildi",
};

export const candidateConfig: ModuleRecordConfig = {
  title: "İşe Alım",
  addLabel: "Aday ekle",
  emptyLabel: "Henüz aday kaydı yok.",
  fields: [
    { key: "position", label: "Pozisyon", type: "text", required: true },
    { key: "candidateName", label: "Aday adı", type: "text", required: true },
    { key: "stage", label: "Aşama", type: "select", defaultValue: "interview", options: opts(CANDIDATE_STAGE) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.candidateName ?? ""} · ${d.position ?? ""}`,
  detail: (d) => labelOf(CANDIDATE_STAGE, d.stage),
  computeStats: (records) => [
    { label: "Süreçte", value: String(countBy(records, "stage", "interview") + countBy(records, "stage", "offer")) },
    { label: "İşe alınan", value: String(countBy(records, "stage", "hired")) },
    { label: "Reddedilen", value: String(countBy(records, "stage", "rejected")) },
  ],
};

// ============================================================ Eğitim ve gelişim planlama
// Zaman eksenli (A5): takvim görünümü ve otomatik görev üretimi A5 motoruyla gelecek.
const TRAINING_TYPE = {
  internal: "İç eğitim",
  external: "Dış eğitim",
  certification: "Sertifika",
  conference: "Konferans",
  online: "Online",
};
const TRAINING_STATUS = { planned: "Planlandı", ongoing: "Devam ediyor", done: "Tamamlandı", cancelled: "İptal" };

export const trainingConfig: ModuleRecordConfig = {
  periodKey: "plannedDate",
  title: "Eğitim ve Gelişim",
  addLabel: "Eğitim ekle",
  emptyLabel: "Henüz eğitim planı yok.",
  fields: [
    { key: "title", label: "Eğitim", type: "text", required: true },
    { key: "participant", label: "Katılımcı", type: "text", placeholder: "Kişi veya ekip" },
    { key: "trainingType", label: "Tür", type: "select", defaultValue: "internal", options: opts(TRAINING_TYPE) },
    { key: "plannedDate", label: "Planlanan tarih", type: "date" },
    currencyField("cost", "Maliyet"),
    { key: "status", label: "Durum", type: "select", defaultValue: "planned", options: opts(TRAINING_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.title ?? ""}${d.participant ? ` · ${d.participant}` : ""}`,
  detail: (d) => joinDetail(labelOf(TRAINING_TYPE, d.trainingType), labelOf(TRAINING_STATUS, d.status), d.plannedDate as string),
  computeStats: (records) => [
    { label: "Planlanan", value: String(countBy(records, "status", "planned")) },
    { label: "Tamamlanan", value: String(countBy(records, "status", "done")) },
    ...moneyStats("Toplam maliyet", records.filter((r) => r.data.status !== "cancelled"), "cost"),
  ],
};

// ============================================================ Performans izleme
// Dönemsel değerlendirme kayıtları. Hedeflerden beslenmesi (yonetim_hedef_belirleme)
// türetilmiş alan desteğiyle gelecek — bkz. docs/moduller/11-modul-crm_musteri.md §11.
const RATING = {
  below: "Beklentinin altında",
  meets: "Beklentileri karşılıyor",
  above: "Beklentinin üstünde",
  outstanding: "Üstün başarı",
};

export const performanceConfig: ModuleRecordConfig = {
  periodKey: "reviewDate",
  title: "Performans İzleme",
  addLabel: "Değerlendirme ekle",
  emptyLabel: "Henüz performans değerlendirmesi yok.",
  fields: [
    { key: "employeeName", label: "Çalışan", type: "text", required: true },
    { key: "period", label: "Dönem", type: "text", required: true, placeholder: "Örn. 2026 Q3" },
    { key: "goalAchievement", label: "Hedef gerçekleşme (%)", type: "number" },
    { key: "rating", label: "Değerlendirme", type: "select", defaultValue: "meets", options: opts(RATING) },
    { key: "reviewDate", label: "Değerlendirme tarihi", type: "date" },
    userField("reviewer", "Değerlendiren"),
    { key: "notes", label: "Geri bildirim", type: "textarea" },
  ],
  summary: (d) => `${d.employeeName ?? ""}${d.period ? ` · ${d.period}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(RATING, d.rating),
      d.goalAchievement !== undefined && d.goalAchievement !== null ? `Gerçekleşme %${d.goalAchievement}` : undefined,
      d.reviewer as string
    ),
  computeStats: (records) => [
    { label: "Değerlendirme", value: String(records.length) },
    {
      label: "Beklenti üstü",
      value: String(countWhere(records, (d) => d.rating === "above" || d.rating === "outstanding")),
    },
    { label: "Beklenti altı", value: String(countBy(records, "rating", "below")) },
  ],
};

// ============================================================ Bordro ve özlük
// HASSAS MODÜL. Maaş bilgisi taşır; modüle atanmamış kişiler görmemelidir.
// Bugün yetki modülün kendisinde (module_members) — alan bazlı gizleme ve
// "restricted" hassasiyet seviyesi Faz 1'de gelecek.
// Bkz. docs/moduller/10-modul-fm_gelir_gider.md §6 (arketip kararları).
const PAYROLL_STATUS = { draft: "Hazırlanıyor", approved: "Onaylandı", paid: "Ödendi" };

export const payrollConfig: ModuleRecordConfig = {
  periodKey: "paymentDate",
  title: "Bordro ve Özlük",
  addLabel: "Bordro ekle",
  emptyLabel: "Henüz bordro kaydı yok.",
  fields: [
    { key: "employeeName", label: "Çalışan", type: "text", required: true },
    { key: "period", label: "Dönem", type: "text", required: true, placeholder: "Örn. 2026/07" },
    { key: "grossSalary", label: "Brüt ücret", type: "number" },
    currencyField("amount", "Net ödeme", { required: true }),
    { key: "status", label: "Durum", type: "select", defaultValue: "draft", options: opts(PAYROLL_STATUS) },
    { key: "paymentDate", label: "Ödeme tarihi", type: "date" },
    NOTES_FIELD,
  ],
  summary: (d) => `${d.employeeName ?? ""}${d.period ? ` · ${d.period}` : ""}`,
  detail: (d) => joinDetail(labelOf(PAYROLL_STATUS, d.status), d.paymentDate as string),
  computeStats: (records) => [
    { label: "Kayıt", value: String(records.length) },
    { label: "Ödenen", value: String(countBy(records, "status", "paid")) },
    ...moneyStats("Ödenmemiş net", records.filter((r) => r.data.status !== "paid")),
  ],
};

// ============================================================ İç iletişim ve şirket kültürü
// Not: bu modülün çekirdeğe (organizasyon duyuru akışı — project_posts deseni)
// taşınması öneriliyor; bkz. docs/moduller/01-modul-arketip-eslesmesi.md.
// O taşınana kadar duyuru/etkinlik kayıt defteri olarak çalışır.
const INTERNAL_TYPE = {
  announcement: "Duyuru",
  event: "Etkinlik",
  survey: "Anket",
  celebration: "Kutlama",
  meeting: "Toplantı",
};
const INTERNAL_STATUS = { planned: "Planlandı", published: "Yayınlandı", done: "Tamamlandı" };

export const internalCommsConfig: ModuleRecordConfig = {
  periodKey: "date",
  title: "İç İletişim ve Kültür",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz duyuru veya etkinlik yok.",
  fields: [
    { key: "title", label: "Başlık", type: "text", required: true },
    { key: "type", label: "Tür", type: "select", defaultValue: "announcement", options: opts(INTERNAL_TYPE) },
    { key: "date", label: "Tarih", type: "date" },
    { key: "audience", label: "Kime", type: "text", placeholder: "Örn. Tüm şirket, Satış ekibi" },
    { key: "status", label: "Durum", type: "select", defaultValue: "planned", options: opts(INTERNAL_STATUS) },
    { key: "notes", label: "İçerik / not", type: "textarea" },
  ],
  summary: (d) => (d.title as string) ?? "",
  detail: (d) => joinDetail(labelOf(INTERNAL_TYPE, d.type), labelOf(INTERNAL_STATUS, d.status), d.date as string, d.audience as string),
  computeStats: (records) => [
    { label: "Planlanan", value: String(countBy(records, "status", "planned")) },
    { label: "Yayınlanan", value: String(countBy(records, "status", "published")) },
    { label: "Toplam", value: String(records.length) },
  ],
};
