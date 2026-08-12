import type { PlanTimeBlock } from "@projelio/shared";

/**
 * Takvim gridinin ölçü ve tarih matematiği.
 *
 * Sayfadan ayrı duruyor çünkü aynı hesaplar üç yerde gerekiyor: blokların
 * konumlandırılması, sürükle-bırakta düşülen saatin bulunması ve gün
 * başlıklarının yazılması. Bileşenin içinde kalsalardı ya kopyalanırlardı ya
 * da bileşen okunamaz hâle gelirdi.
 */

/** Bir saatlik dilimin piksel yüksekliği. */
export const HOUR_HEIGHT = 56;

/** Sürükle-bırakta saat bu adıma yuvarlanır. */
export const SNAP_MINUTES = 15;

/** Blok yüksekliği ne kadar kısa olursa olsun başlık okunabilsin. */
export const MIN_BLOCK_HEIGHT = 22;

export const WEEKDAY_LABELS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const MONTH_LABELS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const DAY_MS = 24 * 60 * 60 * 1000;

// --------------------------------------------------------------------- Tarih
//
// Sunucu tarafındaki planning.dates.ts ile AYNI kural: gün aritmetiği UTC gece
// yarısı üzerinden yapılır. Yerel saatle yapılsaydı UTC+3'te ve yaz saati
// geçişlerinde tarih bir gün kayar, kullanıcının haftası yanlış otururdu.

export function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function formatDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayStr(): string {
  // Kullanıcının "bugün"ü yerel takvimine göredir; UTC'ye çevirirken günün
  // kaymaması için yerel tarih bileşenlerinden kuruluyor.
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function addDays(value: string, days: number): string {
  return formatDay(new Date(parseDay(value).getTime() + days * DAY_MS));
}

export function addMonths(value: string, months: number): string {
  const d = parseDay(value);
  // Ayın 1'ine sabitlenmiş bir tarihte taşma olmaz; takvim hep ay başına
  // gittiği için ayrıca gün kırpmaya gerek yok.
  return formatDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1)));
}

export function startOfWeek(value: string): string {
  const dow = parseDay(value).getUTCDay();
  return addDays(value, dow === 0 ? -6 : 1 - dow);
}

export function startOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

export function weekdayOf(value: string): number {
  return parseDay(value).getUTCDay();
}

export function dayOfMonth(value: string): number {
  return parseDay(value).getUTCDate();
}

/** "12 Ağustos 2026 Çarşamba" */
export function longDayLabel(value: string): string {
  const d = parseDay(value);
  const weekdayFull = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  return `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${weekdayFull[d.getUTCDay()]}`;
}

/** "12 Ağu" */
export function shortDayLabel(value: string): string {
  const d = parseDay(value);
  return `${d.getUTCDate()} ${MONTH_LABELS[d.getUTCMonth()].slice(0, 3)}`;
}

/** "Ağustos 2026" */
export function monthLabel(value: string): string {
  const d = parseDay(value);
  return `${MONTH_LABELS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  // Güvenlik freni: bozuk bir aralık sonsuz döngüye dönüşmesin.
  for (let i = 0; i < 400 && cursor <= to; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

// ---------------------------------------------------------------------- Saat

export function timeToMinutes(value: string): number {
  const [h, m] = value.split(":");
  return Number(h) * 60 + Number(m);
}

export function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** "3 sa 30 dk" / "45 dk" — sıfır dakikayı yazmaz. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} dk`;
  if (rest === 0) return `${h} sa`;
  return `${h} sa ${rest} dk`;
}

/**
 * Gridin kaç ile kaç arasında çizileceği.
 *
 * Mesai saatleriyle başlanır, ama mesai dışına taşan bloklar varsa grid onları
 * kapsayacak kadar genişler. Aksi halde kullanıcının 20:00'de koyduğu blok
 * takvimde hiç görünmezdi — "kaybolan blok" en can sıkıcı takvim hatasıdır.
 */
export function gridRange(blocks: PlanTimeBlock[], dayStart: string, dayEnd: string): { startHour: number; endHour: number } {
  let min = Math.floor(timeToMinutes(dayStart) / 60);
  let max = Math.ceil(timeToMinutes(dayEnd) / 60);
  for (const b of blocks) {
    min = Math.min(min, Math.floor(timeToMinutes(b.startsAt) / 60));
    max = Math.max(max, Math.ceil(timeToMinutes(b.endsAt) / 60));
  }
  return { startHour: Math.max(0, min), endHour: Math.min(24, Math.max(max, min + 1)) };
}

/** Fare/dokunma konumundan saat: gridin üstünden kaç piksel aşağıdaysa. */
export function offsetToTime(offsetY: number, startHour: number): string {
  const minutes = startHour * 60 + (offsetY / HOUR_HEIGHT) * 60;
  return minutesToTime(Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES);
}

/** Bloğun grid içindeki üst konumu ve yüksekliği. */
export function blockGeometry(block: PlanTimeBlock, startHour: number): { top: number; height: number } {
  const start = timeToMinutes(block.startsAt) - startHour * 60;
  const length = timeToMinutes(block.endsAt) - timeToMinutes(block.startsAt);
  return {
    top: (start / 60) * HOUR_HEIGHT,
    height: Math.max(MIN_BLOCK_HEIGHT, (length / 60) * HOUR_HEIGHT),
  };
}

/**
 * Aynı anda başlayan/çakışan blokları yan yana dizmek için sütun ataması.
 *
 * Çakışan bloklar üst üste basılsaydı alttaki tıklanamaz olurdu. Basit bir
 * kümeleme yeterli: zaman sırasına dizilir, biten grup kapanınca yeni gruba
 * geçilir; grup içindeki her blok boşta olan ilk sütuna yerleşir.
 */
export function layoutColumns(blocks: PlanTimeBlock[]): Map<string, { column: number; columns: number }> {
  const result = new Map<string, { column: number; columns: number }>();
  const sorted = [...blocks].sort((a, b) => timeToMinutes(a.startsAt) - timeToMinutes(b.startsAt));

  let group: PlanTimeBlock[] = [];
  let groupEnd = -1;

  const flush = () => {
    if (group.length === 0) return;
    const columnEnds: number[] = [];
    const assignment = new Map<string, number>();
    for (const b of group) {
      const start = timeToMinutes(b.startsAt);
      let col = columnEnds.findIndex((end) => end <= start);
      if (col === -1) {
        col = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[col] = timeToMinutes(b.endsAt);
      assignment.set(b.id, col);
    }
    for (const b of group) {
      result.set(b.id, { column: assignment.get(b.id)!, columns: columnEnds.length });
    }
    group = [];
    groupEnd = -1;
  };

  for (const b of sorted) {
    const start = timeToMinutes(b.startsAt);
    if (group.length > 0 && start >= groupEnd) flush();
    group.push(b);
    groupEnd = Math.max(groupEnd, timeToMinutes(b.endsAt));
  }
  flush();

  return result;
}

// ------------------------------------------------------------- Sürükle-bırak
//
// Native HTML5 sürükle-bırak kullanılıyor: takvimde bırakma hedefi bir liste
// öğesi değil, sütunun İÇİNDEKİ BİR KONUM (saat). Sortable/dnd kütüphaneleri
// liste yeniden sıralaması için tasarlandığından burada fayda sağlamıyor,
// üstelik yeni bir bağımlılık gelirdi.

export const DRAG_BLOCK = "application/x-projelio-plan-block";
export const DRAG_ITEM = "application/x-projelio-plan-item";

export interface DraggedItem {
  itemId: string;
  /**
   * Bloğun hangi tabloya bağlanacağı. Kişisel pano kartlarının kaynağı
   * ("personal" / "assigned") ile karıştırılmamalı: atanmış bir pano kartı da,
   * seçiciden gelen bir proje görevi de aynı şeydir — bir `tasks` satırı.
   */
  kind: "task" | "personal";
  title: string;
  /** Görevin tahmini süresi varsa blok o uzunlukta açılır. */
  minutes?: number;
}
