/**
 * Gönderim hızı kuralları — ban riskini düşüren tarafın saf hesabı.
 *
 * Resmi olmayan istemcide ban kalıcı ve itirazsız. Tetikleyiciler: robotik
 * zamanlama, kısa sürede çok mesaj, tanımadığı kişilere yazmak, gece
 * yarısı bildirim. Buradaki sayılar ölçüm değil, topluluk pratiği
 * (docs/whatsapp-qr-plan.md §6); env ile ayarlanabilir.
 *
 * Veritabanı yok: "şu ana kadar şu kadar gönderildi" gerçekleri dışarıdan
 * verilir, karar burada döner. Test tablosu whatsapp-rate-limit.test.ts.
 */

export interface RateLimitConfig {
  /** Dakika/saat/gün tavanları (bağlantı başına). */
  perMinute: number;
  perHour: number;
  perDay: number;
  /** Isınma: ilk gün izin verilen mesaj sayısı ve günlük çarpan. */
  warmupDayOneLimit: number;
  warmupGrowth: number;
  warmupDays: number;
  /** Aynı kişiye günde en fazla. */
  perContactPerDay: number;
  /** Sessiz saat aralığı [başlangıç, bitiş) — yerel saat, saat cinsinden. */
  quietHoursStart: number;
  quietHoursEnd: number;
  /** Gönderimler arası rastgele bekleme (ms). */
  jitterMinMs: number;
  jitterMaxMs: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  perMinute: 8,
  perHour: 200,
  perDay: 1500,
  warmupDayOneLimit: 20,
  warmupGrowth: 1.8,
  warmupDays: 7,
  perContactPerDay: 20,
  quietHoursStart: 22,
  quietHoursEnd: 8,
  jitterMinMs: 2_000,
  jitterMaxMs: 8_000,
};

/** Env'den okunan ayarlar; tanımsız olanlar varsayılana düşer (sır değil). */
export function rateLimitFromEnv(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const num = (name: string, fallback: number): number => {
    const raw = env[name];
    const n = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return {
    perMinute: num("WHATSAPP_RATE_PER_MINUTE", DEFAULT_RATE_LIMIT.perMinute),
    perHour: num("WHATSAPP_RATE_PER_HOUR", DEFAULT_RATE_LIMIT.perHour),
    perDay: num("WHATSAPP_RATE_PER_DAY", DEFAULT_RATE_LIMIT.perDay),
    warmupDayOneLimit: num("WHATSAPP_WARMUP_DAY_ONE", DEFAULT_RATE_LIMIT.warmupDayOneLimit),
    warmupGrowth: DEFAULT_RATE_LIMIT.warmupGrowth,
    warmupDays: num("WHATSAPP_WARMUP_DAYS", DEFAULT_RATE_LIMIT.warmupDays),
    perContactPerDay: num("WHATSAPP_RATE_PER_CONTACT_PER_DAY", DEFAULT_RATE_LIMIT.perContactPerDay),
    quietHoursStart: num("WHATSAPP_QUIET_START", DEFAULT_RATE_LIMIT.quietHoursStart),
    quietHoursEnd: num("WHATSAPP_QUIET_END", DEFAULT_RATE_LIMIT.quietHoursEnd),
    jitterMinMs: DEFAULT_RATE_LIMIT.jitterMinMs,
    jitterMaxMs: DEFAULT_RATE_LIMIT.jitterMaxMs,
  };
}

/**
 * Isınma merdiveni: bağlantının kaçıncı gününde olduğuna göre günlük tavan.
 * 1. gün warmupDayOneLimit, her gün ×warmupGrowth, warmupDays sonunda perDay.
 */
export function dailyCapForWarmup(config: RateLimitConfig, warmupStartedAt: Date | null, now: Date): number {
  if (!warmupStartedAt) return config.warmupDayOneLimit;
  const dayIndex = Math.floor((now.getTime() - warmupStartedAt.getTime()) / 86_400_000);
  if (dayIndex >= config.warmupDays) return config.perDay;
  const cap = Math.floor(config.warmupDayOneLimit * Math.pow(config.warmupGrowth, Math.max(0, dayIndex)));
  return Math.min(cap, config.perDay);
}

/** Sessiz saatte mi? Aralık gece yarısını aşabilir (22 → 8). */
export function isQuietHour(config: RateLimitConfig, localHour: number): boolean {
  const { quietHoursStart: start, quietHoursEnd: end } = config;
  if (start === end) return false;
  return start < end ? localHour >= start && localHour < end : localHour >= start || localHour < end;
}

export interface SendWindowFacts {
  sentLastMinute: number;
  sentLastHour: number;
  sentToday: number;
  sentToContactToday: number;
  warmupStartedAt: Date | null;
  /** Bağlantı 463/475 nedeniyle duraklatıldıysa bitiş anı. */
  pausedUntil: Date | null;
  /** Yerel saat (0–23). Zaman dilimi dönüşümü çağıranın işi. */
  localHour: number;
  now: Date;
  /**
   * Kullanıcının kendi isteğine cevap: sessiz saat uygulanmaz.
   *
   * Sessiz saat kuralı ban riskini düşürmek için var ve tetikleyici gece
   * yarısı BİLDİRİM atmak. Kullanıcı 02:00'de Lio'ya kendisi yazdıysa cevabı
   * sabaha ertelemek istenmeyen mesaj korkusuyla istenen mesajı geciktirmek
   * olurdu. Yalnızca sessiz saati atlar — hacim tavanları (dakika/saat/gün/
   * kişi) ban riskinin asıl kaynağı olduğu için bu bayrakla delinmez.
   */
  bypassQuietHours?: boolean;
}

export type SendDecision = { allowed: true } | { allowed: false; reason: SendBlockReason };

export type SendBlockReason = "paused" | "quiet_hours" | "per_minute" | "per_hour" | "per_day" | "per_contact";

/** Şu an bir mesaj daha gönderilebilir mi? İlk takılan kural nedeni olur. */
export function decideSend(config: RateLimitConfig, facts: SendWindowFacts): SendDecision {
  if (facts.pausedUntil && facts.pausedUntil.getTime() > facts.now.getTime()) {
    return { allowed: false, reason: "paused" };
  }
  if (!facts.bypassQuietHours && isQuietHour(config, facts.localHour)) {
    return { allowed: false, reason: "quiet_hours" };
  }
  if (facts.sentLastMinute >= config.perMinute) return { allowed: false, reason: "per_minute" };
  if (facts.sentLastHour >= config.perHour) return { allowed: false, reason: "per_hour" };
  if (facts.sentToday >= dailyCapForWarmup(config, facts.warmupStartedAt, facts.now)) {
    return { allowed: false, reason: "per_day" };
  }
  if (facts.sentToContactToday >= config.perContactPerDay) return { allowed: false, reason: "per_contact" };
  return { allowed: true };
}

/** Gönderimler arası bekleme; rastgelelik dışarıdan (test için). */
export function jitterMs(config: RateLimitConfig, random: () => number = Math.random): number {
  return Math.floor(config.jitterMinMs + random() * (config.jitterMaxMs - config.jitterMinMs));
}

/**
 * Başarısız gönderimde bir sonraki deneme anı: 1 dk, 5 dk, 30 dk; sonra
 * vazgeç. null = artık deneme (failed).
 */
export function nextRetryAt(attemptCount: number, now: Date): Date | null {
  const delaysMin = [1, 5, 30];
  const delay = delaysMin[attemptCount - 1];
  if (delay === undefined) return null;
  return new Date(now.getTime() + delay * 60_000);
}
