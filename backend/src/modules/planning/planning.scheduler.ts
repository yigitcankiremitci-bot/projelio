import { minutesToTime, timeToMinutes } from "./planning.dates";

/**
 * Hedefleri takvime dağıtan saf algoritma.
 *
 * Servisten AYRI duruyor çünkü buradaki tek şey aritmetik: veritabanı yok,
 * kullanıcı yok, yan etki yok. Ayrılmasının iki karşılığı var — mantık tek
 * başına test edilebiliyor, ve servis okunurken "bu blok neden salı 11:00'e
 * düştü" sorusunun cevabı tek bir dosyada duruyor.
 *
 * Neden dil modeline bırakılmıyor: bu iş aritmetik, ve dil modelleri
 * aritmetikte hem pahalı hem güvenilmez. Model kullanıcıyla konuşup hedefleri
 * çıkarır, hesabı bu fonksiyon yapar. Böylece "%60 yazılım" gerçekten haftanın
 * %60'ı olur, modelin tahmini olmaz.
 */

/** Bir öneri bloğunun altına inemeyeceği süre; bundan kısası takvimde işe yaramaz. */
export const MIN_SUGGESTED_BLOCK_MINUTES = 30;

export interface SchedulerDemand {
  focusAreaId: string;
  focusAreaName?: string;
  color?: string;
  /** Bu alana dönem boyunca ayrılması gereken toplam dakika. */
  minutes: number;
}

/** Takvimde zaten dolu olan aralık — üstüne yazılmaz. */
export interface SchedulerBusy {
  blockDate: string;
  startsAt: string;
  endsAt: string;
}

export interface SchedulerOptions {
  /** Dağıtımın yapılacağı günler, sıralı. */
  workDays: string[];
  dayStart: string;
  dayEnd: string;
  focusBlockMinutes: number;
  breakMinutes: number;
}

export interface SchedulerProposal {
  blockDate: string;
  startsAt: string;
  endsAt: string;
  focusAreaId: string;
  title?: string;
  color?: string;
}

export interface SchedulerResult {
  proposals: SchedulerProposal[];
  /** Takvimde yer kalmadığı için karşılanamayan süre. Sessizce kırpılmaz. */
  shortfall: { focusAreaId: string; focusAreaName?: string; minutes: number }[];
}

/**
 * Kurallar:
 *   - Yalnızca verilen günlere ve mesai penceresine yerleşir.
 *   - Dolu aralıklara DOKUNMAZ; onların etrafına yerleşir.
 *   - Her alanın payı günlere yayılır; bir alanın işi tek güne yığılmaz.
 *   - Yetmeyen süre `shortfall` olarak raporlanır.
 */
export function distribute(
  demands: SchedulerDemand[],
  busy: SchedulerBusy[],
  opts: SchedulerOptions
): SchedulerResult {
  const remaining = new Map(demands.map((d) => [d.focusAreaId, d.minutes]));
  const proposals: SchedulerProposal[] = [];

  const windowStart = timeToMinutes(opts.dayStart);
  const windowEnd = timeToMinutes(opts.dayEnd);

  for (const [index, day] of opts.workDays.entries()) {
    const free = freeIntervals(
      windowStart,
      windowEnd,
      busy.filter((b) => b.blockDate === day)
    );

    // Günlük kota her gün YENİDEN hesaplanır: kalan ihtiyaç / kalan gün.
    // Sabit bir günlük pay (toplam / gün sayısı) kullanılsaydı, dolu bir salı
    // yüzünden yerleşemeyen süre sonraki günlere devredemez ve hafta sonunda
    // hiç sebep yokken eksik kalırdı.
    const daysLeft = opts.workDays.length - index;
    const dayQuota = new Map(demands.map((d) => [d.focusAreaId, (remaining.get(d.focusAreaId) ?? 0) / daysLeft]));

    for (const interval of free) {
      let cursor = interval.start;
      while (interval.end - cursor >= MIN_SUGGESTED_BLOCK_MINUTES) {
        // Sırada, o gün en çok kotası kalan alan var. Böylece alanlar gün
        // içinde de dönüşümlü ilerler, biri diğerini aç bırakmaz.
        const next = [...dayQuota.entries()]
          .filter(([, mins]) => mins >= MIN_SUGGESTED_BLOCK_MINUTES)
          .sort((a, b) => b[1] - a[1])[0];
        if (!next) break;

        const [areaId, quota] = next;
        const length = Math.floor(Math.min(opts.focusBlockMinutes, quota, interval.end - cursor));
        if (length < MIN_SUGGESTED_BLOCK_MINUTES) break;

        const demand = demands.find((d) => d.focusAreaId === areaId)!;
        proposals.push({
          blockDate: day,
          startsAt: minutesToTime(cursor),
          endsAt: minutesToTime(cursor + length),
          focusAreaId: areaId,
          title: demand.focusAreaName,
          color: demand.color,
        });

        dayQuota.set(areaId, quota - length);
        remaining.set(areaId, (remaining.get(areaId) ?? 0) - length);
        cursor += length + opts.breakMinutes;
      }
    }
  }

  const shortfall = demands
    .map((d) => ({
      focusAreaId: d.focusAreaId,
      focusAreaName: d.focusAreaName,
      minutes: Math.max(0, Math.round(remaining.get(d.focusAreaId) ?? 0)),
    }))
    .filter((s) => s.minutes >= MIN_SUGGESTED_BLOCK_MINUTES);

  return { proposals, shortfall };
}

/**
 * Mesai penceresinden dolu blokları çıkarır, geriye kalan boşlukları verir.
 * Yerleştirici yalnızca bu boşluklara yazar; elle konmuş hiçbir bloğun üstüne
 * gidilmez.
 *
 * Dışa açık çünkü tek başına test edilmesi anlamlı: çakışma mantığındaki bir
 * hata, kullanıcının randevusunun üstüne blok koymak demek.
 */
export function freeIntervals(
  windowStart: number,
  windowEnd: number,
  blocks: { startsAt: string; endsAt: string }[]
): { start: number; end: number }[] {
  const busy = blocks
    .map((b) => ({ start: timeToMinutes(b.startsAt), end: timeToMinutes(b.endsAt) }))
    .sort((a, b) => a.start - b.start);

  const free: { start: number; end: number }[] = [];
  let cursor = windowStart;
  for (const b of busy) {
    // Pencerenin tamamen dışında kalan (ör. mesai öncesi) bloklar atlanır.
    if (b.end <= cursor) continue;
    if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, windowEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= windowEnd) break;
  }
  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd });

  return free.filter((f) => f.end - f.start >= MIN_SUGGESTED_BLOCK_MINUTES);
}
