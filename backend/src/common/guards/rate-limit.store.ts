/**
 * Bellek içi sabit pencere sayacı — hız sınırlayıcı guard'ların ortak deposu.
 *
 * NEDEN AYRI DOSYA: aynı mantık önce yalnızca AuthRateLimitGuard içindeydi.
 * Yükleme uçlarına da sınır gerekince kopyalamak yerine buraya alındı; iki
 * guard aynı depoyu ve aynı temizlik davranışını paylaşıyor.
 *
 * NOT: yalnızca TEK bir backend sürecinde çalışır — çoklu instance'ta her süreç
 * kendi sayacını tutar. render.yaml şu an tek instance tanımlıyor; ölçeklendirme
 * öncesi paylaşımlı bir sayaca geçilmeli. (`ioredis` package.json'da duruyor ama
 * kullanılmıyor ve Redis servisi sağlanmış değil — "zaten var" diye planlama.)
 *
 * Sabit pencere, kayan değil: pencere sınırında iki katı kadar istek geçebilir
 * (59. saniyede N, 61. saniyede N daha). Kaba kuvvet ve kaynak tüketimini
 * yavaşlatmak için yeterli; hassas bir kota gerekiyorsa kayan pencereye geçilmeli.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweepAt = 0;

/**
 * Süresi dolmuş kovaları siler.
 *
 * NEDEN: bir anahtar yalnızca aynı istemci tekrar istek attığında üzerine
 * yazılıyordu; bir daha dönmeyen anahtarların kaydı Map'te sonsuza kadar
 * kalıyordu. Zamanlayıcı (setInterval) yerine istek üzerinde çalışır: süreç
 * trafiksizken boşuna uyanmasın ve testte sahte zaman gerekmesin.
 */
function sweep(now: number, windowMs: number): void {
  if (now - lastSweepAt < windowMs) return;
  lastSweepAt = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

/**
 * Anahtar için bir istek harcar.
 *
 * @returns pencere içinde sınır aşılmadıysa true, aşıldıysa false.
 */
export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  sweep(now, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;

  bucket.count += 1;
  return true;
}

/** Yalnızca testler için: süreç genelindeki sayaçları sıfırlar. */
export function resetRateLimitStore(): void {
  buckets.clear();
  lastSweepAt = 0;
}
