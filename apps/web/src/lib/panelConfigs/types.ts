import type { ModuleRecord } from "@projelio/shared";
import { MODULE_RECORD_CONFIGS, fmtMoney, sumByCurrency, todayISO } from "../moduleConfigs";

/**
 * A6 — Türev Panel arketipi.
 *
 * Bu modüllerin KENDİ VERİSİ YOKTUR. Diğer modüllerin kayıtlarını okur, dönem
 * seçimine göre süzer ve gösterge üretir. Veri girişi almazlar.
 *
 * Neden istemci tarafında hesaplanıyor: modül alan tanımları (hangi alan tutar,
 * hangi alan tarih, hangi değer "açık" demek) yalnızca web tarafında yaşıyor.
 * Hesabı sunucuya taşımak önce o tanımların paylaşılan pakete taşınmasını
 * gerektirir — bu, panellerden bağımsız ve daha büyük bir iş.
 *
 * Bkz. docs/moduller/00-modul-mimarisi.md §2 (A6)
 */

// ============================================================ Dönem

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "this_year" | "all";

export interface Period {
  key: PeriodKey;
  label: string;
  /** ISO tarih (YYYY-MM-DD), dahil. "all" için undefined. */
  from?: string;
  to?: string;
}

// toISOString() UTC'ye çevirip günü kaydırır (bkz. moduleConfigs/shared.ts todayISO).
const iso = todayISO;

export function buildPeriod(key: PeriodKey, today = new Date()): Period {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case "this_month":
      return { key, label: "Bu ay", from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "last_month":
      return { key, label: "Geçen ay", from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { key, label: "Bu çeyrek", from: iso(new Date(y, q, 1)), to: iso(new Date(y, q + 3, 0)) };
    }
    case "this_year":
      return { key, label: "Bu yıl", from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    default:
      return { key: "all", label: "Tüm zamanlar" };
  }
}

export const PERIOD_KEYS: PeriodKey[] = ["this_month", "last_month", "this_quarter", "this_year", "all"];

/**
 * Kayıt dönem içinde mi.
 *
 * Tarihi olmayan kayıt DIŞARIDA BIRAKILMAZ: bütçe kalemi, risk, stok gibi
 * modüllerde olay tarihi kavramı yoktur ve bunları sessizce süzmek kullanıcıya
 * "verim kayboldu" hissi verir.
 */
export function inPeriod(record: ModuleRecord, moduleKey: string, period: Period): boolean {
  if (!period.from || !period.to) return true;
  const periodKey = MODULE_RECORD_CONFIGS[moduleKey]?.periodKey;
  if (!periodKey) return true;
  const value = record.data[periodKey];
  if (typeof value !== "string" || !value) return true;
  return value >= period.from && value <= period.to;
}

// ============================================================ Panel bağlamı

export interface PanelContext {
  /** modül anahtarı -> o modülün dönem içindeki kayıtları. */
  records: Map<string, ModuleRecord[]>;
  /** Organizasyonda etkin modüller (kapalı kaynakları uyarmak için). */
  enabledModules: Set<string>;
  period: Period;
  /** Müşteri sayısı gibi party tabanlı ölçümler için. */
  partyCount: number;
  customerCount: number;
}

export function recordsOf(ctx: PanelContext, moduleKey: string): ModuleRecord[] {
  return ctx.records.get(moduleKey) ?? [];
}

/** Birden fazla modülün kayıtlarını birleştirir. */
export function recordsOfAll(ctx: PanelContext, moduleKeys: string[]): ModuleRecord[] {
  return moduleKeys.flatMap((k) => recordsOf(ctx, k));
}

// ============================================================ Panel tanımı

export interface PanelMetric {
  label: string;
  /** Gösterge değeri. Hesaplanamıyorsa "—" döner. */
  compute: (ctx: PanelContext) => string;
  /** Kartın altındaki açıklama satırı. */
  hint?: (ctx: PanelContext) => string | undefined;
  /** Bu gösterge hangi modüllere dayanıyor (eksikse uyarı için). */
  sources: string[];
}

export interface PanelBreakdownRow {
  label: string;
  value: number;
  /** Ekranda gösterilecek biçimlenmiş değer; verilmezse sayı yazılır. */
  display?: string;
}

export interface PanelBreakdown {
  title: string;
  sources: string[];
  compute: (ctx: PanelContext) => PanelBreakdownRow[];
  /** Boş çıktığında gösterilecek metin. */
  emptyLabel?: string;
}

export interface PanelConfig {
  title: string;
  /** Panelin ne cevapladığı — boş ekranda bile kullanıcı ne olduğunu anlasın. */
  purpose: string;
  /** Okuduğu modüller. Hiçbiri etkin değilse panel dürüstçe bunu söyler. */
  sources: string[];
  metrics: PanelMetric[];
  breakdowns?: PanelBreakdown[];
  /** Holding geneli paneller henüz tek organizasyonla sınırlı. */
  scopeNote?: string;
}

// ============================================================ Hesap yardımcıları

export const NA = "—";

export function countRecords(ctx: PanelContext, moduleKeys: string[], predicate?: (d: Record<string, unknown>) => boolean): number {
  const rows = recordsOfAll(ctx, moduleKeys);
  return predicate ? rows.filter((r) => predicate(r.data)).length : rows.length;
}

/**
 * Para toplamı. Farklı para birimleri ASLA toplanmaz; birden fazla varsa
 * hepsi yan yana yazılır (bkz. moduleConfigs/shared.ts sumByCurrency).
 */
export function sumMoney(
  ctx: PanelContext,
  moduleKeys: string[],
  amountField: string,
  predicate?: (d: Record<string, unknown>) => boolean
): string {
  let rows = recordsOfAll(ctx, moduleKeys);
  if (predicate) rows = rows.filter((r) => predicate(r.data));
  const totals = sumByCurrency(rows, amountField);
  if (totals.size === 0) return fmtMoney(0, "TRY");
  return Array.from(totals.entries())
    .map(([currency, sum]) => fmtMoney(sum, currency))
    .join(" + ");
}

/** Alan değerine göre gruplayıp sayar ya da toplar. */
export function groupBy(
  rows: ModuleRecord[],
  field: string,
  labelOf: (value: string) => string,
  options: { sumField?: string } = {}
): PanelBreakdownRow[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const raw = r.data[field];
    const key = typeof raw === "string" && raw ? raw : "(belirtilmemiş)";
    const add = options.sumField ? Number(r.data[options.sumField]) || 0 : 1;
    totals.set(key, (totals.get(key) ?? 0) + add);
  }
  return Array.from(totals.entries())
    .map(([key, value]) => ({ label: key === "(belirtilmemiş)" ? key : labelOf(key), value }))
    .sort((a, b) => b.value - a.value);
}

/** Yüzde; payda sıfırsa "—" (0 yazmak yanıltıcı olurdu). */
export function percent(part: number, total: number): string {
  if (!total) return NA;
  return `%${Math.round((part / total) * 100)}`;
}
