import type { ModuleRecord } from "@projelio/shared";

// Modül alan tanımlarının ortak tipleri ve yardımcıları.
//
// ModuleRecordsPanel bu tanımlardan form + liste + özet gösterge üretir; yeni
// bir modülü tam özellikli yapmak için panele değil, ilgili departman dosyasına
// (finans.ts, pazarlama.ts …) bir tanım eklemek yeterlidir.
//
// Alan tipi sözlüğü şimdilik 5 tiple sınırlı. currency/entity_ref/user_ref/file
// gibi tipler A2 motoruyla birlikte gelecek — bkz. docs/moduller/05-mevcut-kod-ile-uzlasma.md
// (Faz 2). O yüzden bugün "karşı taraf", "sorumlu" gibi alanlar serbest metin.

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

// ============================================================ Yardımcılar

export function fmtMoney(amount: unknown, currency: unknown): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return "";
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: (currency as string) || "TRY" }).format(n);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

export function countBy(records: ModuleRecord[], field: string, value: string): number {
  return records.filter((r) => r.data[field] === value).length;
}

export function countWhere(records: ModuleRecord[], predicate: (data: Record<string, unknown>) => boolean): number {
  return records.filter((r) => predicate(r.data)).length;
}

/**
 * Para birimlerini birbirine karıştırmadan toplar. Kur dönüşümü yapılmadığı
 * için farklı para birimleri ayrı ayrı gösterilir.
 */
export function sumByCurrency(rows: ModuleRecord[], amountField = "amount"): Map<string, number> {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const currency = (r.data.currency as string) || "TRY";
    totals.set(currency, (totals.get(currency) ?? 0) + (Number(r.data[amountField]) || 0));
  }
  return totals;
}

/** Para birimi başına bir gösterge kutucuğu üretir; hiç kayıt yoksa sıfırlı tek kutucuk. */
export function moneyStats(label: string, rows: ModuleRecord[], amountField = "amount"): ModuleSummaryStat[] {
  const totals = sumByCurrency(rows, amountField);
  if (totals.size === 0) return [{ label, value: fmtMoney(0, "TRY") }];
  return Array.from(totals.entries()).map(([currency, sum]) => ({
    label: totals.size > 1 ? `${label} (${currency})` : label,
    value: fmtMoney(sum, currency),
  }));
}

/** Etiket sözlüğünü select alanının beklediği biçime çevirir. */
export function opts(map: Record<string, string>): ModuleFieldOption[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

/** Kayıttaki ham değerin okunabilir etiketi. Bilinmeyen değer için undefined. */
export function labelOf(map: Record<string, string>, value: unknown): string | undefined {
  return typeof value === "string" ? map[value] : undefined;
}

/** " · " ile birleştirilmiş, boşları atılmış detay satırı. */
export function joinDetail(...parts: (string | undefined | null | false)[]): string | undefined {
  const s = parts.filter(Boolean).join(" · ");
  return s || undefined;
}

export const CURRENCY_FIELD: ModuleFieldConfig = {
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

export const NOTES_FIELD: ModuleFieldConfig = { key: "notes", label: "Not", type: "textarea" };
