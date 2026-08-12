import { NOTES_FIELD, countBy, countWhere, joinDetail, labelOf, opts, type ModuleRecordConfig } from "./shared";

// MÜŞTERİ İLİŞKİLERİ departmanının modülleri.
//
// Not: Müşteri modülü hem Müşteri İlişkileri (mid_musteri_modulu) hem Satış ve
// İş Geliştirme (spd_musteri_modulu) kataloğunda aynı adla geçiyor. İkisi de bu
// yapılandırmayı kullanıyor ama AYRI module_key ile AYRI kayıt yazıyor — yani
// aynı müşteri iki departmanda iki farklı kayıt oluyor.
// Bu bilinen bir veri bölünmesi; tek `party` tablosunda birleştirilmesi Faz 3'e ait.
// Bkz. docs/moduller/03-ortak-varlik-party.md ve 11-modul-crm_musteri.md

// ============================================================ Müşteri
const CUSTOMER_STATUS = { lead: "Aday", active: "Aktif", inactive: "Pasif" };

export const customerConfig: ModuleRecordConfig = {
  title: "Müşteriler",
  addLabel: "Müşteri ekle",
  emptyLabel: "Henüz müşteri kaydı yok.",
  fields: [
    { key: "name", label: "İsim", type: "text", required: true },
    { key: "contact", label: "İletişim (telefon/e-posta)", type: "text" },
    { key: "status", label: "Durum", type: "select", defaultValue: "lead", options: opts(CUSTOMER_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => (d.name as string) ?? "",
  detail: (d) => joinDetail(labelOf(CUSTOMER_STATUS, d.status), d.contact as string),
  computeStats: (records) => [
    { label: "Toplam", value: String(records.length) },
    { label: "Aktif", value: String(countBy(records, "status", "active")) },
    { label: "Aday", value: String(countBy(records, "status", "lead")) },
  ],
};

// ============================================================ Şikayet ve Öneri
const COMPLAINT_TYPE = { complaint: "Şikayet", suggestion: "Öneri" };
const COMPLAINT_STATUS = { open: "Açık", resolved: "Çözüldü" };

export const complaintConfig: ModuleRecordConfig = {
  title: "Şikayet ve Öneri",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz şikayet/öneri kaydı yok.",
  fields: [
    { key: "type", label: "Tür", type: "select", defaultValue: "complaint", options: opts(COMPLAINT_TYPE) },
    { key: "customerName", label: "Müşteri adı", type: "text" },
    { key: "description", label: "Açıklama", type: "textarea", required: true },
    { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(COMPLAINT_STATUS) },
    { key: "date", label: "Tarih", type: "date" },
  ],
  summary: (d) => `${labelOf(COMPLAINT_TYPE, d.type) ?? "Şikayet"}${d.customerName ? ` · ${d.customerName}` : ""}`,
  detail: (d) => labelOf(COMPLAINT_STATUS, d.status) ?? "Açık",
  computeStats: (records) => [
    {
      label: "Açık şikayet",
      value: String(countWhere(records, (d) => d.type !== "suggestion" && d.status === "open")),
    },
    { label: "Çözülen", value: String(countBy(records, "status", "resolved")) },
    { label: "Öneri", value: String(countBy(records, "type", "suggestion")) },
  ],
};

// ============================================================ Teknik Destek
// Talep (ticket) yönetimi. Şikayet/Öneri modülüyle aynı arketipte (A4) —
// ikisinin tek "Talep Yönetimi" modülünde birleştirilmesi öneriliyor
// (bkz. docs/moduller/01-modul-arketip-eslesmesi.md ⚠️). Birleşene kadar ayrı,
// çünkü destek talebi öncelik ve kanal gibi ek alanlar taşıyor.
const TICKET_PRIORITY = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
const TICKET_CHANNEL = { email: "E-posta", phone: "Telefon", web: "Web formu", onsite: "Yerinde" };
const TICKET_STATUS = {
  open: "Açık",
  in_progress: "İşlemde",
  waiting: "Müşteri bekleniyor",
  resolved: "Çözüldü",
  closed: "Kapandı",
};

export const supportTicketConfig: ModuleRecordConfig = {
  title: "Teknik Destek",
  addLabel: "Talep aç",
  emptyLabel: "Henüz destek talebi yok.",
  fields: [
    { key: "subject", label: "Konu", type: "text", required: true },
    { key: "customerName", label: "Müşteri", type: "text" },
    { key: "priority", label: "Öncelik", type: "select", defaultValue: "normal", options: opts(TICKET_PRIORITY) },
    { key: "channel", label: "Geliş kanalı", type: "select", defaultValue: "email", options: opts(TICKET_CHANNEL) },
    { key: "assignee", label: "Sorumlu", type: "text" },
    { key: "openedDate", label: "Açılış tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "open", options: opts(TICKET_STATUS) },
    { key: "description", label: "Açıklama", type: "textarea" },
  ],
  summary: (d) => `${d.subject ?? ""}${d.customerName ? ` · ${d.customerName}` : ""}`,
  detail: (d) =>
    joinDetail(
      labelOf(TICKET_STATUS, d.status),
      d.priority && d.priority !== "normal" ? `Öncelik: ${labelOf(TICKET_PRIORITY, d.priority)}` : undefined,
      d.assignee as string,
      d.openedDate as string
    ),
  computeStats: (records) => {
    // "Açık" tanımı: çözülmemiş ve kapanmamış her şey. Müşteri beklenen talepler
    // de açık sayılır — çünkü müşteri için hâlâ çözülmemiş görünür.
    const open = countWhere(records, (d) => d.status !== "resolved" && d.status !== "closed");
    const urgent = countWhere(
      records,
      (d) => d.status !== "resolved" && d.status !== "closed" && (d.priority === "urgent" || d.priority === "high")
    );
    return [
      { label: "Açık talep", value: String(open) },
      { label: "Yüksek öncelikli", value: String(urgent) },
      { label: "Çözülen", value: String(countBy(records, "status", "resolved") + countBy(records, "status", "closed")) },
    ];
  },
};
