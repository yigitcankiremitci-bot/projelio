import { MUAF_DEPARTMAN_ANAHTARI } from "./departmanKurali";

/**
 * Şirketteki bir modülün "evi" (kullanıcı kararı, 2026-11-01): ilgili
 * departmanı açıksa o departman, değilse YÖNETİM departmanı.
 *
 * Önce "yönetici (departmansız)" diye ayrı bir yer vardı; modül ekleme
 * penceresinde departmanların yanında görünüyor, kafa karıştırıyordu. Yönetim
 * zaten kuraldan muaf, sahibin kendi departmanı (bkz. departmanKurali.ts) —
 * departmanı açılmamış modülün doğal yeri orası. Ev kayıtlı değil, her seferinde
 * hesaplanıyor: Finans sonradan açılınca Faturalar kendiliğinden oraya geçer.
 *
 * Sunucu (yetki: ModuleMembersService.departmentsWithModule) ve arayüz (kart
 * adresi, Yönetim'in modül listesi) aynı fonksiyondan geçer.
 */

export type EvAdayi = { id: string; catalogKey?: string | null };

/**
 * @param anahtarlar modülün katalogdaki departman anahtarları, birincil başta
 * @returns ev departmanın kimliği; şirkette Yönetim de yoksa undefined
 */
export function modulunEvi(anahtarlar: readonly string[], departmanlar: readonly EvAdayi[]): string | undefined {
  const idByKey = new Map<string, string>();
  for (const d of departmanlar) if (d.catalogKey && !idByKey.has(d.catalogKey)) idByKey.set(d.catalogKey, d.id);
  for (const key of anahtarlar) {
    const id = idByKey.get(key);
    if (id) return id;
  }
  return idByKey.get(MUAF_DEPARTMAN_ANAHTARI);
}

/** Modülün kendi departmanlarından biri şirkette açık mı (Yönetim'e düşmeden). */
export function departmaniAcik(anahtarlar: readonly string[], departmanlar: readonly EvAdayi[]): boolean {
  const acik = new Set(departmanlar.map((d) => d.catalogKey).filter(Boolean));
  return anahtarlar.some((k) => acik.has(k));
}
