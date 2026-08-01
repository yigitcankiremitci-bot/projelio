/**
 * Projelio AI kredi ekonomisi.
 *
 * Zincir şu şekilde işler:
 *   token kullanımı -> ham maliyet (USD) -> + komisyon -> satış bedeli (USD) -> kredi
 *
 * Projelio, Anthropic'ten token bazlı maliyetle hizmet alır ve kullanıcıya soyut
 * "Projelio Kredisi" olarak, üzerine komisyon ekleyerek satar. Kullanıcı token/dolar
 * görmez; yalnızca kredi bakiyesini görür.
 */

/** Anthropic liste fiyatları — milyon token başına USD. */
export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Fiyatlar Anthropic tarafından güncellenebilir; model eklerken burayı güncelleyin.
 * Listede olmayan bir model kullanılırsa DEFAULT_PRICING geçerli olur (marjı korumak
 * için kasıtlı olarak yüksek tutulmuştur).
 *
 * ÖNEMLİ: Bu tablo Anthropic'in canlı fiyatlarını OTOMATİK çekmez. Anthropic fiyat
 * değiştirirse burası (veya AI_PRICE_OVERRIDE ortam değişkeni) güncellenmelidir;
 * aksi halde kâr marjı hesabı yanlış olur.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-haiku-4-5-20251001": { inputPerMillion: 1, outputPerMillion: 5 },
  "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
  "claude-sonnet-5": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-5": { inputPerMillion: 15, outputPerMillion: 75 },
};

export const DEFAULT_PRICING: ModelPricing = { inputPerMillion: 15, outputPerMillion: 75 };

/**
 * Prompt caching çarpanları (standart girdi fiyatına göre):
 * önbelleğe yazma 1,25× — önbellekten okuma 0,10×.
 */
export const CACHE_WRITE_MULTIPLIER = Number(process.env.AI_CACHE_WRITE_MULTIPLIER ?? 1.25);
export const CACHE_READ_MULTIPLIER = Number(process.env.AI_CACHE_READ_MULTIPLIER ?? 0.1);

/**
 * Fiyatları kod değiştirmeden güncelleyebilmek için isteğe bağlı override.
 * Biçim: AI_PRICE_OVERRIDE='{"claude-haiku-4-5-20251001":{"inputPerMillion":1,"outputPerMillion":5}}'
 */
function readPriceOverride(): Record<string, ModelPricing> {
  const raw = process.env.AI_PRICE_OVERRIDE;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ModelPricing>;
  } catch {
    return {};
  }
}

const PRICE_OVERRIDE = readPriceOverride();

/** Projelio komisyon oranı. 0.20 = %20. */
export const COMMISSION_RATE = Number(process.env.AI_COMMISSION_RATE ?? 0.2);

/**
 * 1 Projelio Kredisi'nin USD karşılığı (satış bedeli üzerinden).
 * 0.0001 => 10.000 kredi ≈ 1 USD'lik satış bedeli.
 * Bu değer, kullanıcının gördüğü sayıların "okunabilir" büyüklükte olmasını sağlar:
 * Haiku ile tipik bir asistan turu yaklaşık 40-80 kredi tutar.
 */
export const CREDIT_UNIT_USD = Number(process.env.AI_CREDIT_UNIT_USD ?? 0.0001);

/** Bir istek başlatılabilmesi için gereken asgari bakiye (tur ortasında kesilmeyi azaltır). */
export const MIN_BALANCE_TO_START = Number(process.env.AI_MIN_BALANCE_TO_START ?? 20);

/**
 * Yeni kullanıcılara ilk kullanımda tanımlanan deneme kredisi (0 = kapalı).
 * 2.000 kredi ≈ 14 asistan işlemi; Projelio'ya maliyeti ≈ 0,17 USD.
 */
export const WELCOME_CREDITS = Number(process.env.AI_WELCOME_CREDITS ?? 2000);

export function getPricing(model: string): ModelPricing {
  return PRICE_OVERRIDE[model] ?? MODEL_PRICING[model] ?? DEFAULT_PRICING;
}

export interface UsageCost {
  costUsd: number;
  chargedUsd: number;
  credits: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Önbelleğe yazılan token'lar (standart girdinin 1,25 katı fiyatlanır). */
  cacheWriteTokens?: number;
  /** Önbellekten okunan token'lar (standart girdinin 0,10 katı fiyatlanır). */
  cacheReadTokens?: number;
}

/**
 * Token kullanımını krediye çevirir.
 *
 * Önbellek token'ları ayrı fiyatlandığı için ayrı hesaplanır — bunları normal girdi
 * gibi saymak maliyeti olduğundan yüksek gösterir ve kullanıcıdan fazla kredi keser.
 * Kredi sayısı yukarı yuvarlanır (2 ondalık) ki küsurattan Projelio zarar etmesin.
 */
export function calculateUsageCost(model: string, usage: TokenUsage): UsageCost {
  const pricing = getPricing(model);
  const perInputToken = pricing.inputPerMillion / 1_000_000;

  const costUsd =
    usage.inputTokens * perInputToken +
    (usage.cacheWriteTokens ?? 0) * perInputToken * CACHE_WRITE_MULTIPLIER +
    (usage.cacheReadTokens ?? 0) * perInputToken * CACHE_READ_MULTIPLIER +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillion;

  const chargedUsd = costUsd * (1 + COMMISSION_RATE);
  const credits = Math.ceil((chargedUsd / CREDIT_UNIT_USD) * 100) / 100;

  return {
    costUsd: Number(costUsd.toFixed(6)),
    chargedUsd: Number(chargedUsd.toFixed(6)),
    credits,
  };
}
