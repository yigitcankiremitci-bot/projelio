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
  /** Tek denemenin üst sınırı (ms). 0 verilirse zaman aşımı uygulanmaz. */
  timeoutMs?: number;
}

/**
 * Varsayılan istek zaman aşımı.
 *
 * NEDEN GEREKLİ: Node'un fetch'inde yanıt için zaman aşımı YOKTUR — yalnızca
 * bağlantı kurulurken bir sınır vardır. Bağlantı kurulmuş ama karşı taraf gövdeyi
 * göndermiyorsa istek sonsuza kadar asılı kalır. Yeniden deneme mantığı da onunla
 * birlikte asılır; istek slotu ve bellek boşa tutulur.
 *
 * 15 saniye: en yavaş meşru sorgunun (büyük liste + join) rahatça sığdığı, ama
 * asılı kalmış bir isteği kullanıcıyı dakikalarca bekletmeden kesen aralık.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Çağıranın kendi signal'i ile zaman aşımı signal'ini birleştirir.
 *
 * Çağıranın signal'i EZİLMEMELİ: supabase-js `abortSignal()` ile istek iptali
 * sunuyor ve onu doğrudan init.signal'e koyuyor. Üzerine yazsaydık iptal sessizce
 * çalışmaz hâle gelirdi. AbortSignal.any ikisinden hangisi önce tetiklenirse onu
 * uygular (Node 20+).
 */
function withTimeout(init: any, timeoutMs: number): { init: any; done: () => void } {
  if (!timeoutMs) return { init, done: () => {} };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`İstek ${timeoutMs} ms içinde yanıtlanmadı`)), timeoutMs);
  const existing = init?.signal;
  const signal =
    existing && typeof AbortSignal.any === "function" ? AbortSignal.any([existing, controller.signal]) : controller.signal;

  return { init: { ...(init ?? {}), signal }, done: () => clearTimeout(timer) };
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRetryingFetch(
  baseFetch: typeof fetch,
  options: RetryOptions = {}
): typeof fetch {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 200;
  const sleep = options.sleep ?? defaultSleep;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function retryingFetch(input: any, init?: any): Promise<Response> {
    const canRetry = RETRYABLE_METHODS.has(methodOf(input, init));

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const attemptInit = withTimeout(init, timeoutMs);
      try {
        return await baseFetch(input, attemptInit.init);
      } catch (error) {
        lastError = error;
        // Çağıran isteği kendi iptal ettiyse (supabase-js abortSignal) bu bir
        // ağ hatası değil, kasıtlı bir vazgeçiştir: yeniden denemek yanlış olur.
        if (init?.signal?.aborted) throw error;
        // Kod hatası ya da yazma isteği: yeniden deneme, olduğu gibi bildir.
        // Zaman aşımı da isNetworkFailure kapsamındadır (AbortError) — asılı kalan
        // okuma isteği kesilip yeniden denenir, yazma isteği denenmez.
        if (!canRetry || !isNetworkFailure(error) || attempt === maxAttempts) throw error;
        options.onRetry?.(attempt, error);
        // Üstel geri çekilme: 200ms, 400ms. Ağ toparlanmasına zaman tanır,
        // kullanıcıyı da fark edilir biçimde bekletmez.
        await sleep(baseDelayMs * 2 ** (attempt - 1));
      } finally {
        // Zamanlayıcı her denemede temizlenmeli: başarılı istekten sonra kalırsa
        // süreç, iş bitmiş olmasına rağmen zamanlayıcı süresince açık kalır.
        attemptInit.done();
      }
    }
    throw lastError;
  } as typeof fetch;
}
