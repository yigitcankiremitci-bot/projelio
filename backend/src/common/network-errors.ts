/**
 * Ağ hatalarını tanıma ve okunur hale getirme — saf yardımcılar.
 *
 * NestJS dekoratörü içeren dosyalardan ayrı tutuluyor: hem yeniden deneme
 * katmanı (retrying-fetch.ts) hem hata filtresi bunları kullanıyor, ikisinin
 * ortak bağımlılığının framework'e bağlanması gereksiz. Ayrıca dekoratörsüz
 * olduğu için doğrudan test edilebiliyor.
 */

/** Ağ katmanında sayılan hata kodları — kod hatası değil, ulaşılamama. */
const NETWORK_CODES = [
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
];

/** Zincirde döngü olsa bile sonsuz dönmemek için üst sınır. */
const MAX_DEPTH = 5;

export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * `error.cause` zincirini okunur hale getirir.
 *
 * fetch hataları iç içe sarmalanır: TypeError -> AggregateError -> Error(ENOTFOUND).
 * Asıl bilgi en içtedir, bu yüzden zincir sonuna kadar takip edilir.
 */
export function describeCause(error: unknown, depth = 0): string | undefined {
  if (depth > MAX_DEPTH || !(error instanceof Error)) return undefined;

  const cause = (error as { cause?: unknown }).cause;
  if (!cause) return undefined;

  const parts: string[] = [];
  if (cause instanceof Error) {
    const code = (cause as { code?: string }).code;
    parts.push(code ? `${code} (${cause.message})` : describeError(cause));

    // AggregateError: birden fazla deneme başarısız olmuş (ör. IPv4 ve IPv6).
    const errors = (cause as { errors?: unknown[] }).errors;
    if (Array.isArray(errors) && errors.length) {
      const inner = errors
        .slice(0, 3)
        .map((e) => (e instanceof Error ? ((e as { code?: string }).code ?? e.message) : String(e)));
      parts.push(`[${inner.join(", ")}]`);
    }

    const deeper = describeCause(cause, depth + 1);
    if (deeper) parts.push(`<- ${deeper}`);
  } else {
    parts.push(String(cause));
  }
  return parts.join(" ");
}

/**
 * Ağ katmanı hatası mı.
 *
 * Yanlış sınıflandırma iki yönde de tehlikeli: gerçek bir kod hatasını ağ
 * hatası sayarsak 503 arkasına gizleriz; ağ hatasını kod hatası sayarsak
 * yeniden denemeyiz. Bu yüzden yalnızca bilinen kodlar ve `fetch failed`
 * kabul ediliyor.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === "fetch failed" || error.name === "AbortError") return true;

  let current: unknown = error;
  for (let depth = 0; depth < MAX_DEPTH && current instanceof Error; depth += 1) {
    const code = (current as { code?: string }).code;
    if (code && NETWORK_CODES.includes(code)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
