import { findModel } from "./providers/providers.config";
import type { ModelTier } from "./ai-credits.config";

/**
 * Model ayarlarının SAF doğrulama mantığı.
 *
 * NEDEN AYRI DOSYA: `ai-model-settings.service.ts` bir Nest servisi ve
 * `@Injectable()` taşımak zorunda (bağımlılığı var). Node'un tip-silme test
 * koşucusu dekoratörleri ayrıştıramadığı için o dosya testlerde yüklenemiyor.
 * Asıl korunması gereken mantık — geçersiz bir modelin kaydedilmemesi — burada,
 * bağımlılıksız ve test edilebilir hâlde duruyor.
 */

export const TIERS: ModelTier[] = ["fast", "smart", "max"];

export function isValidTier(value: unknown): value is ModelTier {
  return TIERS.includes(String(value ?? "").trim() as ModelTier);
}

/** Bilinmeyen kademe `fast`'e düşer — bozuk bir kayıt asistanı durdurmamalı. */
export function normalizeTier(value: unknown): ModelTier {
  const v = String(value ?? "").trim() as ModelTier;
  return TIERS.includes(v) ? v : "fast";
}

/**
 * "saglayici:model" seçimini doğrular ve temizler.
 *
 * Boş/whitespace girdi `null` döner: kod varsayılanına dönmek istendiği anlamına
 * gelir. Katalogda olmayan bir seçim ise HATA verir — sessizce kaydedilirse
 * asistan her istekte sağlayıcıdan 404 alır ve sebebi panelde görünmez.
 */
export function normalizeModelKey(value: string | null | undefined): {
  ok: boolean;
  value: string | null;
  error?: string;
} {
  const temiz = value?.trim() || null;
  if (!temiz) return { ok: true, value: null };

  const [providerId, ...rest] = temiz.split(":");
  const modelId = rest.join(":");
  if (!providerId || !modelId || !findModel(providerId, modelId)) {
    return { ok: false, value: null, error: `"${temiz}" katalogda yok. Geçerli bir model seçin.` };
  }
  return { ok: true, value: temiz };
}
