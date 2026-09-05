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
  joinDetail,
  labelOf,
  opts,
  userField,
  type ModuleRecordConfig,
} from "./shared";

// YÖNETİM departmanının modülleri.
//
// Bu departmandaki proje/program/görev/çıktı/dosya/bütçe "modülleri" aslında
// Projelio'nun çekirdeğidir (projects, operations, tasks, outputs, files) —
// modül olarak tanımlanmazlar. Analiz/raporlama/denetim ise türev panel (A6)
// olduğu için veri girişi almaz, kendi motorunu bekler.
// Bkz. docs/moduller/01-modul-arketip-eslesmesi.md

// ============================================================ Hedef belirleme
const GOAL_STATUS = { not_started: "Başlanmadı", in_progress: "Devam ediyor", done: "Tamamlandı" };

export const goalConfig: ModuleRecordConfig = {
  periodKey: "targetDate",
  title: "Hedefler",
  addLabel: "Hedef ekle",
  emptyLabel: "Henüz hedef tanımlanmadı.",
  fields: [
    { key: "title", label: "Hedef", type: "text", required: true },
    userField("owner", "Sorumlu"),
    { key: "targetDate", label: "Hedef tarih", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "not_started", options: opts(GOAL_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => (d.title as string) ?? "",
  detail: (d) => joinDetail(d.owner as string, labelOf(GOAL_STATUS, d.status), d.targetDate as string),
  computeStats: (records) => [
    { label: "Devam eden", value: String(countBy(records, "status", "in_progress")) },
    { label: "Tamamlanan", value: String(countBy(records, "status", "done")) },
    { label: "Toplam", value: String(records.length) },
  ],
};

// ============================================================ Vizyon ve Misyon
// Bunlar aslında tek kayıtlık form modülleri (A1) — bir şirketin bir vizyonu
// olur. Mevcut motor liste tabanlı olduğu için her kayıt bir SÜRÜM gibi
// çalışır: vizyon güncellendiğinde yenisi eklenir, eskisi geçmişte kalır.
// A1 motoru geldiğinde tek kayda indirilip versiyon geçmişi ayrılacak.
const STATEMENT_STATUS = { draft: "Taslak", approved: "Onaylandı", outdated: "Güncellenmeli" };
const HORIZON = { y1: "1 yıl", y3: "3 yıl", y5: "5 yıl", y10: "10 yıl" };

export const visionConfig: ModuleRecordConfig = {
  periodKey: "effectiveDate",
  title: "Vizyon",
  addLabel: "Vizyon ekle",
  emptyLabel: "Henüz vizyon tanımlanmadı.",
  fields: [
    {
      key: "statement",
      label: "Vizyon ifadesi",
      type: "textarea",
      required: true,
      placeholder: "Gelecekte nerede olmak istiyoruz?",
    },
    { key: "horizon", label: "Zaman ufku", type: "select", defaultValue: "y5", options: opts(HORIZON) },
    { key: "effectiveDate", label: "Geçerlilik tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "draft", options: opts(STATEMENT_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => (d.statement as string) ?? "",
  detail: (d) => joinDetail(labelOf(STATEMENT_STATUS, d.status), labelOf(HORIZON, d.horizon), d.effectiveDate as string),
  computeStats: (records) => [
    { label: "Sürüm", value: String(records.length) },
    { label: "Onaylı", value: String(countBy(records, "status", "approved")) },
  ],
};

export const missionConfig: ModuleRecordConfig = {
  periodKey: "effectiveDate",
  title: "Misyon",
  addLabel: "Misyon ekle",
  emptyLabel: "Henüz misyon tanımlanmadı.",
  fields: [
    {
      key: "statement",
      label: "Misyon ifadesi",
      type: "textarea",
      required: true,
      placeholder: "Bugün kime, hangi değeri sunuyoruz?",
    },
    { key: "audience", label: "Kime hizmet ediyoruz", type: "text" },
    { key: "effectiveDate", label: "Geçerlilik tarihi", type: "date" },
    { key: "status", label: "Durum", type: "select", defaultValue: "draft", options: opts(STATEMENT_STATUS) },
    NOTES_FIELD,
  ],
  summary: (d) => (d.statement as string) ?? "",
  detail: (d) => joinDetail(labelOf(STATEMENT_STATUS, d.status), d.audience as string, d.effectiveDate as string),
  computeStats: (records) => [
    { label: "Sürüm", value: String(records.length) },
    { label: "Onaylı", value: String(countBy(records, "status", "approved")) },
  ],
};
