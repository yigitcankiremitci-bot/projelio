// dil:anahtar-dosya
//
// Bu dosyadaki metinlerin tamamı arayüzde görünen etiket: modül başlıkları,
// alan adları, seçenek adları, boş durum cümleleri. Hepsi modül düzeyinde
// sabit olduğu için burada t() çağrılamıyor; Türkçe metin sözlük ANAHTARI
// olarak kalıyor ve çeviri render anında yapılıyor (bkz. ModuleRecordsPanel).
// Karşılıkları: apps/web/src/lib/i18n/en/moduller.ts

import {
  countBy,
  countWhere,
  joinDetail,
  labelOf,
  opts,
  partyField,
  userField,
  type ModuleRecordConfig,
} from "./shared";

// MÜŞTERİ İLİŞKİLERİ departmanının modülleri.
//
// Müşteri modülü burada YOK: artık ortak `party` varlığına yazıyor ve kendi
// paneli var (CustomersPanel). Önceden mid_musteri_modulu ve spd_musteri_modulu
// diye iki ayrı anahtar vardı; aynı arayüzü kullanıyor ama ayrı kayıt tutuyor,
// yani aynı müşteri iki departmanda bölünüyordu.
// Bkz. 046_party_and_customer_merge.sql, lib/entityModules.ts

// ============================================================ Şikayet ve Öneri
const COMPLAINT_TYPE = { complaint: "Şikayet", suggestion: "Öneri" };
const COMPLAINT_STATUS = { open: "Açık", resolved: "Çözüldü" };

export const complaintConfig: ModuleRecordConfig = {
  periodKey: "date",
  title: "Şikayet ve Öneri",
  addLabel: "Kayıt ekle",
  emptyLabel: "Henüz şikayet/öneri kaydı yok.",
  fields: [
    { key: "type", label: "Tür", type: "select", defaultValue: "complaint", options: opts(COMPLAINT_TYPE) },
    partyField("customerName", "Müşteri", { entityRole: "customer" }),
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
  periodKey: "openedDate",
  title: "Teknik Destek",
  addLabel: "Talep aç",
  emptyLabel: "Henüz destek talebi yok.",
  fields: [
    { key: "subject", label: "Konu", type: "text", required: true },
    partyField("customerName", "Müşteri", { entityRole: "customer" }),
    { key: "priority", label: "Öncelik", type: "select", defaultValue: "normal", options: opts(TICKET_PRIORITY) },
    { key: "channel", label: "Geliş kanalı", type: "select", defaultValue: "email", options: opts(TICKET_CHANNEL) },
    userField("assignee", "Sorumlu"),
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
