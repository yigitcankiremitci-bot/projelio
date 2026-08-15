import { isNetworkFailure } from "../common/network-errors";

/**
 * Geçici ağ hatalarında yeniden deneyen fetch.
 *
 * Neden: Supabase istemcisi yeniden deneme yapmaz. Wi-Fi'nin bir saniyelik
 * hıçkırığı, DNS'in gecikmesi ya da dizüstünün uykudan uyanması anında
 * "TypeError: fetch failed" olarak kullanıcıya yansıyordu — oysa bir sonraki
 * denemede istek geçiyor.
 *
 * YALNIZCA OKUMA istekleri yeniden denenir. `fetch failed` isteğin sunucuya
 * hiç ulaşmadığını GARANTİ ETMEZ; yanıt dönerken kopmuş da olabilir. Bir POST'u
 * yeniden denemek çift kayıt yaratır — bu yüzden yazma istekleri tek denemede
 * bırakılır ve hata olduğu gibi yukarı verilir.
 */

const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * İsteğin HTTP metodu.
 *
 * fetch iki biçimde çağrılabilir: `fetch(url, { method })` ya da
 * `fetch(new Request(url, { method }))`. İkisini de karşılamak gerekiyor;
 * bulunamazsa fetch'in varsayılanı GET'tir.
 */
function methodOf(input: unknown, init?: { method?: string }): string {
  if (typeof init?.method === "string" && init.method) return init.method.toUpperCase();
  if (input !== null && typeof input === "object") {
    const fromRequest = (input as { method?: unknown }).method;
    if (typeof fromRequest === "string" && fromRequest) return fromRequest.toUpperCase();
  }
  return "GET";
}

export interface RetryOptions {
  maxAttempts?: number;
  /** İlk bekleme (ms); her denemede ikiye katlanır. */
  baseDelayMs?: number;
  /** Testte beklemeyi atlamak için. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRetryingFetch(
  baseFetch: typeof fetch,
  options: RetryOptions = {}
): typeof fetch {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const sleep = options.sleep ?? defaultSleep;

  return async function retryingFetch(input: any, init?: any): Promise<Response> {
    const canRetry = RETRYABLE_METHODS.has(methodOf(input, init));

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await baseFetch(input, init);
      } catch (error) {
        lastError = error;
        // Kod hatası ya da yazma isteği: yeniden deneme, olduğu gibi bildir.
        if (!canRetry || !isNetworkFailure(error) || attempt === maxAttempts) throw error;
        options.onRetry?.(attempt, error);
        // Üstel geri çekilme: 200ms, 400ms. Ağ toparlanmasına zaman tanır,
        // kullanıcıyı da fark edilir biçimde bekletmez.
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  } as typeof fetch;
}
