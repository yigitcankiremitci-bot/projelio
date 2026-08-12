/**
 * Planlama katmanının tarih aritmetiği.
 *
 * Buradaki her fonksiyon "YYYY-MM-DD" biçiminde string alır ve string döner.
 * Date nesnesi yalnızca hesabın içinde, hep UTC gece yarısında kullanılır.
 *
 * Sebep: yerel saat dilimiyle yapılan gün aritmetiği yaz saati geçişlerinde ve
 * UTC+3 gibi ileri dilimlerde bir gün kayabiliyor — "haftanın pazartesi'si"
 * pazar akşamına düşünce kullanıcının bütün haftası bir gün önceye kayardı.
 * Takvimde bir günlük kayma, planın tamamını yanlış yere oturtur.
 *
 * Takvim tarafında saatler kullanıcının kendi saat diliminde yaşar
 * (plan_preferences.timezone); burada yalnızca GÜN hesabı yapılır, o yüzden
 * UTC üzerinden çalışmak güvenlidir.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" -> UTC gece yarısı Date. Geçersiz girdide hata fırlatır. */
export function parseDate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`Geçersiz tarih: ${value}`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Geçersiz tarih: ${value}`);
  return d;
}

/** Date -> "YYYY-MM-DD" (UTC). */
export function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Sunucunun bugünü, "YYYY-MM-DD". */
export function today(): string {
  return formatDate(new Date());
}

export function addDays(value: string, days: number): string {
  return formatDate(new Date(parseDate(value).getTime() + days * DAY_MS));
}

/** İki tarih arasındaki tam gün farkı (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / DAY_MS);
}

/** 0 = Pazar … 6 = Cumartesi. JS getDay() ile aynı ölçek (plan_preferences.workdays da öyle). */
export function weekday(value: string): number {
  return parseDate(value).getUTCDay();
}

/**
 * Haftanın başı — PAZARTESİ.
 *
 * Türkiye'de hafta pazartesi başlar ve planlama dili de öyle kuruluyor
 * ("her pazartesi tüm haftayı planlarım"). Bu tercih plan_preferences'a
 * bağlanmadı: hafta başlangıcını kişiselleştirmek, aynı kullanıcının geçmiş
 * dönem kayıtlarını başka bir güne oturtup karşılaştırmayı bozardı.
 */
export function startOfWeek(value: string): string {
  const dow = weekday(value);
  // Pazar (0) bir önceki haftanın pazartesi'sine bağlanır: -6 gün.
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(value, delta);
}

/** Ayın 1'i. */
export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export type PeriodKind = "day" | "week" | "month";

/** Kademeye göre dönem başlangıcını normalize eder. */
export function normalizePeriodStart(kind: PeriodKind, value: string): string {
  switch (kind) {
    case "day":
      // Normalize edilecek bir şey yok; yine de biçimi doğrula.
      parseDate(value);
      return value;
    case "week":
      return startOfWeek(value);
    case "month":
      return startOfMonth(value);
  }
}

/** Dönemin son günü (dahil). */
export function periodEnd(kind: PeriodKind, start: string): string {
  switch (kind) {
    case "day":
      return start;
    case "week":
      return addDays(start, 6);
    case "month": {
      const d = parseDate(start);
      // Bir sonraki ayın 1'inden bir gün geri: ay uzunluklarını ve artık
      // yılları elle hesaplamaya gerek kalmaz.
      const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      return formatDate(new Date(next.getTime() - DAY_MS));
    }
  }
}

/** Aralıktaki bütün günler (iki uç dahil). */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const total = daysBetween(from, to);
  for (let i = 0; i <= total; i++) out.push(addDays(from, i));
  return out;
}

// --------------------------------------------------------------------- Saat

const ISO_TIME = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

/**
 * Postgres `time` kolonu "09:00:00" döner, arayüz "09:00" konuşur.
 * İkisinin arasındaki tek dönüşüm noktası burasıdır.
 */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "00:00";
  return value.slice(0, 5);
}

/** "09:00" / "09:00:00" -> gece yarısından itibaren dakika. */
export function timeToMinutes(value: string): number {
  const m = ISO_TIME.exec(value);
  if (!m) throw new Error(`Geçersiz saat: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Dakika -> "HH:MM". Gün sınırında kırpar (24:00 yerine 23:59). */
export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function assertTime(value: string): string {
  if (!ISO_TIME.test(value)) throw new Error(`Geçersiz saat: ${value}`);
  return formatTime(value);
}
