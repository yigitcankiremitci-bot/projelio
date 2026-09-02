import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WAHA webhook imzasının doğrulanması (saf).
 *
 * WAHA ham gövdenin HMAC-SHA512 özetini hex olarak `X-Webhook-Hmac`
 * başlığında gönderir; algoritma `X-Webhook-Hmac-Algorithm` başlığında.
 * Karşılaştırma sabit zamanlı: imzayı harf harf tahmin etmeye izin vermesin.
 *
 * Ham gövde şart: JSON ayrıştırılıp yeniden yazılan metin bayt bayt aynı
 * olmayabilir (anahtar sırası, boşluk). Bkz. main.ts rawBody.
 */
export const HMAC_HEADER = "x-webhook-hmac";
export const HMAC_ALGORITHM_HEADER = "x-webhook-hmac-algorithm";

const SUPPORTED_ALGORITHMS = new Set(["sha512", "sha256"]);

export function computeWebhookSignature(rawBody: Buffer | string, key: string, algorithm = "sha512"): string {
  return createHmac(algorithm, key).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(params: {
  rawBody: Buffer | string | undefined;
  key: string;
  signatureHeader: string | undefined;
  algorithmHeader?: string | undefined;
}): boolean {
  const { rawBody, key, signatureHeader } = params;
  if (!rawBody || !signatureHeader || !key) return false;

  const algorithm = (params.algorithmHeader ?? "sha512").toLowerCase();
  if (!SUPPORTED_ALGORITHMS.has(algorithm)) return false;

  const expected = Buffer.from(computeWebhookSignature(rawBody, key, algorithm), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(signatureHeader.trim(), "hex");
  } catch {
    return false;
  }
  if (given.length === 0 || given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}
