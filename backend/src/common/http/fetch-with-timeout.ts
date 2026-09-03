/**
 * Zaman aşımlı fetch — dış servis çağrılarının ortak sarmalayıcısı.
 *
 * NEDEN VAR: Node'un fetch'inde YANIT için zaman aşımı yoktur. Yalnızca bağlantı
 * kurulurken bir sınır işler; bağlantı kurulup karşı taraf gövdeyi göndermezse
 * istek sonsuza kadar asılı kalır. Bu, sessizce en pahalı hata sınıfıydı:
 *
 *   · Nest istek işleyicisi süresiz bloke olur, istek slotu boşa tutulur.
 *   · Kuyruk işleyicilerinde (`running = true` bayrağı) asılı tek bir çağrı
 *     TÜM kuyruğu durdurur — Instagram yayın kuyruğunda tam olarak bu risk vardı.
 *   · Kullanıcı tarafında bu, hata mesajı olmayan sonsuz bir bekleme demektir.
 *
 * Desen WAHA istemcisinden (waha.client.ts) alındı; orada zaten doğru yazılmıştı,
 * burada ortaklaştırıldı ki Google/Microsoft/Graph/Instagram/OpenAI çağrıları da
 * aynı korumayı alsın ve her dosyada AbortController elle kurulmasın.
 */

/**
 * Dış servisler için varsayılan üst sınır.
 *
 * 20 saniye: Drive/Graph gibi servislerde büyük klasör listelemesi birkaç saniye
 * sürebiliyor; buna yer bırakıyor ama asılı kalmış bir bağlantıyı da makul sürede
 * kesiyor. Medya yükleme gibi doğası gereği uzun işler kendi süresini versin.
 */
export const DEFAULT_EXTERNAL_TIMEOUT_MS = 20_000;

export class ExternalTimeoutError extends Error {
  constructor(
    readonly url: string | URL,
    readonly timeoutMs: number
  ) {
    super(`Dış servis ${timeoutMs} ms içinde yanıt vermedi: ${safeHost(url)}`);
    this.name = "ExternalTimeoutError";
  }
}

/** Log'a tam adres yazmamak için yalnızca host — sorgu dizesinde jeton olabilir. */
function safeHost(url: string | URL): string {
  try {
    return new URL(url).host;
  } catch {
    return "bilinmeyen adres";
  }
}

/**
 * Zaman aşımı uygulanmış fetch.
 *
 * Çağıranın kendi `signal`'i EZİLMEZ: varsa zaman aşımıyla birleştirilir, hangisi
 * önce tetiklenirse istek o sebeple kesilir. Böylece hem iptal edilebilirlik hem
 * zaman aşımı birlikte çalışır.
 *
 * Zaman aşımında ham `AbortError` yerine ExternalTimeoutError fırlatılır: "The
 * operation was aborted" mesajı log'da hangi servisin, ne kadar beklendikten
 * sonra düştüğünü söylemiyordu.
 */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_EXTERNAL_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const caller = init.signal;
  const signal =
    caller && typeof AbortSignal.any === "function" ? AbortSignal.any([caller, controller.signal]) : controller.signal;

  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    // Kesen biz miydik, çağıran mı? Çağıran iptal ettiyse onun hatası korunur.
    if (controller.signal.aborted && !caller?.aborted) throw new ExternalTimeoutError(url, timeoutMs);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
