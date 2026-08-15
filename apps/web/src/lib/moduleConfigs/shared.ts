import type { ModuleRecord } from "@projelio/shared";

// Modül alan tanımlarının ortak tipleri ve yardımcıları.
//
// ModuleRecordsPanel bu tanımlardan form + liste + özet gösterge üretir; yeni
// bir modülü tam özellikli yapmak için panele değil, ilgili departman dosyasına
// (finans.ts, pazarlama.ts …) bir tanım eklemek yeterlidir.
//
// Alan tipi sözlüğü (Faz 2 ile genişletildi):
//
//   text / textarea / number / date / select — temel tipler
//   longtext    — çok satırlı gövde metni (A1 form modüllerinin gövdesi)
//   tags        — serbest etiket listesi; multiselect ile AYNI biçimde
//                 (virgülle ayrılmış tek metin) saklanır, farkı seçeneklerin
//                 önceden tanımlı olmaması
//   currency    — tutar + para birimi; iki ayrı anahtara yazar (bkz. currencyKey)
//   entity_ref  — ortak varlığa referans (bugün yalnızca `party`)
//   user_ref    — organizasyon üyesine referans
//   multiselect — çoklu seçim, dizi olarak saklanır
//   formula     — salt okunur, diğer alanlardan hesaplanır
//
// `file` tipi henüz yok: Drive/OneDrive bağlaması ayrı bir iş.
// Bkz. docs/moduller/00-modul-mimarisi.md §4

export type ModuleFieldType =
  | "text"
  | "textarea"
  | "longtext"
  | "number"
  | "date"
  | "select"
  | "currency"
  | "entity_ref"
  | "user_ref"
  | "multiselect"
  | "tags"
  | "formula";

export interface ModuleFieldOption {
  value: string;
  label: string;
}

/** entity_ref hangi ortak varlığa işaret ediyor. */
export type ModuleEntity = "party";

export interface ModuleFieldConfig {
  key: string;
  label: string;
  type: ModuleFieldType;
  required?: boolean;
  options?: ModuleFieldOption[];
  defaultValue?: string;
  placeholder?: string;

  /** currency: para biriminin yazılacağı anahtar. Verilmezse "currency". */
  currencyKey?: string;

  /** entity_ref: hangi varlık ve hangi rolle sınırlı. */
  entity?: ModuleEntity;
  entityRole?: string;
  /** entity_ref: seçicide yeni kayıt açılabilsin mi. */
  creatable?: boolean;

  /**
   * Geriye dönük uyumluluk: alan eskiden serbest metindi ve kayıtlarda ad
   * yazıyor olabilir. Referansa çevrilen alanlarda eski değer olduğu gibi
   * gösterilir — veri kaybı olmaz, kullanıcı isterse yeniden seçer.
   */
  legacyText?: boolean;

  /**
   * formula: diğer alanlardan hesaplama. Tek bir fonksiyon olarak tutuluyor;
   * ifade dili (string) yerine fonksiyon, çünkü hesap zaten TypeScript'te
   * yazılıyor ve ayrı bir yorumlayıcı bakım yükü olurdu.
   */
  compute?: (data: Record<string, unknown>) => number | string | undefined;
  /** formula: sonucun para birimi olarak biçimlendirilmesi isteniyorsa. */
  formatAsCurrency?: boolean;
}

/** Değerin referans mı yoksa eski serbest metin mi olduğunu ayırt eder. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isReferenceValue(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Referans alanının ekranda görünecek hali.
 *
 * Alan referansa çevrilmeden önce girilmiş kayıtlarda ham ad duruyor olabilir;
 * o zaman adı olduğu gibi gösteririz. UUID ise çözümleyiciden ad istenir,
 * bulunamazsa (silinmiş kayıt) yer tutucu döner.
 */
export function displayReference(
  value: unknown,
  resolve: (id: string) => string | undefined
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (!isReferenceValue(value)) return String(value);
  return resolve(value) ?? "(silinmiş kayıt)";
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

  /**
   * Kaydın hangi tarihe göre "dönem içinde" sayılacağı.
   *
   * Her modülün tarih alanının adı farklı (entryDate, dueDate, issueDate…);
   * paneller dönem filtresi uygularken bunu okur. Verilmezse kayıt dönem
   * filtresinden muaf tutulur — tarihi olmayan bir kaydı sessizce dışarıda
   * bırakmak, kullanıcının veri kaybettiğini sanmasına yol açardı.
   */
  periodKey?: string;
  // Liste satırında kalın gösterilecek özet (örn. "+ 1.250,00 TRY · Kira").
  summary: (data: Record<string, unknown>) => string;
  // İkinci satır (opsiyonel, daha soluk gösterilir).
  detail?: (data: Record<string, unknown>) => string | undefined;
  // Modülün ana ekranında listenin üstünde gösterilen gösterge/özet kutucukları
  // (örn. "Net bakiye", "Açık şikayet sayısı").
  computeStats?: (records: ModuleRecord[]) => ModuleSummaryStat[];
}

// ============================================================ Yardımcılar

/**
 * Yerel takvim gününü YYYY-MM-DD olarak verir.
 *
 * `toISOString()` KULLANILMAZ: o UTC'ye çevirir ve Türkiye (UTC+3) gibi
 * doğudaki saat dilimlerinde günü bir geri kaydırır — "1 Ağustos 00:00" yerel
 * saat, UTC'de "31 Temmuz 21:00" olur. Kullanıcının girdiği tarihler yerel
 * takvim günüdür, karşılaştırma da yerel olmalı.
 */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Bugünden N gün sonrası, yerel takvime göre. */
export function daysFromNow(days: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

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

export const CURRENCY_OPTIONS: ModuleFieldOption[] = [
  { value: "TRY", label: "TRY" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

/**
 * Tutar alanı: tek kontrol, iki anahtar.
 *
 * Eskiden her modül `number` + ayrı bir "Para birimi" select'i tanımlıyordu;
 * kullanıcı iki alan görüyordu ve tanımlar arasında tutarsızlık kolaydı.
 * Artık tek `currency` alanı hem tutarı (kendi anahtarına) hem para birimini
 * (`currencyKey`, varsayılan "currency") yazar — veri şekli aynı kaldığı için
 * mevcut kayıtlar ve computeStats hesapları bozulmaz.
 */
export function currencyField(
  key: string,
  label: string,
  extra: Partial<ModuleFieldConfig> = {}
): ModuleFieldConfig {
  return { key, label, type: "currency", currencyKey: "currency", options: CURRENCY_OPTIONS, ...extra };
}

/** Ortak varlığa (müşteri/tedarikçi) referans veren alan. */
export function partyField(
  key: string,
  label: string,
  extra: Partial<ModuleFieldConfig> = {}
): ModuleFieldConfig {
  return { key, label, type: "entity_ref", entity: "party", creatable: true, legacyText: true, ...extra };
}

/** Organizasyon üyesine referans veren alan. */
export function userField(
  key: string,
  label: string,
  extra: Partial<ModuleFieldConfig> = {}
): ModuleFieldConfig {
  return { key, label, type: "user_ref", legacyText: true, ...extra };
}

export const NOTES_FIELD: ModuleFieldConfig = { key: "notes", label: "Not", type: "textarea" };
