import { getSocketId } from "../lib/socketId";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/**
 * HTTP durum kodunu da taşıyan hata tipi.
 *
 * Bazı ekranların hatanın METNİNE değil TÜRÜNE göre davranması gerekiyor —
 * ör. giriş ekranı "şifre yanlış" (401) ile "e-posta doğrulanmamış" (403)
 * durumlarını ayırıp ikincisinde "doğrulama bağlantısını tekrar gönder"
 * seçeneği gösteriyor. Error'dan türediği için mevcut `err instanceof Error`
 * kontrolleri çalışmaya devam eder.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    /**
     * 429 yanıtlarında sunucunun bildirdiği bekleme süresi (saniye).
     * Giriş ekranı bununla canlı geri sayım gösteriyor — kullanıcıya "biraz sonra"
     * demek yerine ne kadar kaldığını söylemek için.
     */
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Oturumun geçersiz olduğunu ANLADIĞIMIZ tek yer.
 *
 * Neden gerekti: App.tsx yalnızca localStorage'da bir token STRING'i var mı
 * diye bakıyordu, geçerli mi diye değil. Token'ın süresi dolduğunda
 * (JWT_EXPIRES_IN=7d) ya da sunucuda JWT_SECRET değiştiğinde kullanıcı giriş
 * ekranına atılmıyor; uygulama normal açılıyor, her istek 401 dönüyor ve
 * çağrı yerlerindeki `.catch(() => setX([]))` bunları yutuyordu. Kullanıcının
 * gördüğü şey bomboş bir uygulamaydı — "bütün işlerim silinmiş" sanıyordu.
 *
 * Yönlendirme bir kez yapılır: aynı anda uçan onlarca istek 401 dönerse
 * hepsi ayrı ayrı yönlendirme tetiklemesin.
 */
let sessionExpiredHandled = false;

function handleExpiredSession(): void {
  if (sessionExpiredHandled) return;
  sessionExpiredHandled = true;
  localStorage.removeItem("projelio_token");
  // Giriş ekranındayken (henüz token yokken alınan 401'ler) yönlendirme yapma:
  // "şifre yanlış" hatası ekranda kalmalı, sayfa yenilenmemeli.
  if (window.location.pathname !== "/login") {
    window.location.href = "/login?session=expired";
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/**
 * Bir isteğin ne kadar sürebileceği.
 *
 * NEDEN GEREKLİ: tarayıcının fetch'inde varsayılan bir zaman aşımı YOKTUR.
 * Sunucu yanıt vermezse (soğuk başlangıç, kopmuş bağlantı, ağ kara deliği)
 * istek dakikalarca asılı kalıyordu: ekranda sonsuza kadar dönen bir spinner,
 * hata mesajı yok, kullanıcı "uygulama dondu" deyip sayfayı yeniliyordu.
 *
 * 30 sn: en yavaş meşru sorgunun rahatça sığdığı, ama asılı kalmış bir isteği
 * kullanıcıyı dakikalarca bekletmeden kesen aralık.
 */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Ağ katmanı hatalarını ApiError'a çevirir.
 *
 * NEDEN: fetch reddedince ham `TypeError: Failed to fetch` yukarı çıkıyordu.
 * Çağrı yerlerindeki `err instanceof ApiError` kontrolleri bunu kaçırıyor,
 * kullanıcıya da İngilizce ve anlamsız bir metin görünüyordu. status: 0
 * konvansiyonu "sunucuya hiç ulaşılamadı"yı HTTP hatalarından ayırır.
 */
function toNetworkError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const aborted = error instanceof DOMException && error.name === "AbortError";
  return new ApiError(
    aborted ? "Sunucu zamanında yanıt vermedi. Bağlantınızı kontrol edip tekrar deneyin." : "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.",
    0
  );
}

/**
 * Çağıranın kendi signal'ini zaman aşımıyla birleştirir.
 * Çağıranın iptali ezilmemeli: bileşenler sayfa değişiminde isteği iptal ediyor.
 */
function signalWithTimeout(caller: AbortSignal | null | undefined): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const signal =
    caller && typeof AbortSignal.any === "function" ? AbortSignal.any([caller, controller.signal]) : controller.signal;
  return { signal, done: () => clearTimeout(timer) };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("projelio_token");
  // Açık soketin kimliği: sunucu bundan isteğin HANGİ SAYFADAN geldiğini bulup
  // değişikliği o sayfadaki diğer kullanıcılara duyuruyor (bkz. lib/liveRoom.ts
  // ve backend realtime.interceptor.ts). Yoksa (soket kapalı) sinyal gitmez,
  // istek normal çalışır.
  const socketId = getSocketId();
  const timeout = signalWithTimeout(options.signal);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: timeout.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(socketId ? { "X-Socket-Id": socketId } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    // Çağıranın kendi iptali sessizce yukarı verilir: bu bir hata değil,
    // "bu veriye artık ihtiyacım yok" demektir (sayfa değişti).
    if (options.signal?.aborted) throw error;
    throw toNetworkError(error);
  } finally {
    timeout.done();
  }
  if (!res.ok) {
    const text = await res.text();
    let message = `API error ${res.status}`;
    let retryAfterSeconds: number | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
      if (typeof parsed?.retryAfterSeconds === "number") retryAfterSeconds = parsed.retryAfterSeconds;
    } catch {
      if (text) message = text;
    }
    // Token'la gidip 401 aldıysak token artık geçersizdir. Giriş denemesinin
    // kendisi (henüz token yok) bu yola girmez; oradaki 401 "şifre yanlış"tır.
    if (res.status === 401 && token) handleExpiredSession();
    throw new ApiError(message, res.status, retryAfterSeconds);
  }
  return parseResponse<T>(res);
}

async function uploadFile<T>(path: string, formData: FormData, signal?: AbortSignal): Promise<T> {
  const token = localStorage.getItem("projelio_token");
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
    // İptal edilebilsin diye: kullanıcı yanlış dosya seçtiğinde yüklemenin
    // bitmesini beklemek zorunda kalmasın (bkz. FilesPanel iptal düğmesi).
    signal,
  });
  if (!res.ok) {
    if (res.status === 401 && token) handleExpiredSession();
    // request() ile aynı ayıklama: eskiden ham gövde fırlatılıyordu ve kullanıcı
    // ekranda `API error 400: {"message":"…","statusCode":400}` görüyordu.
    // Hata metni doğrudan arayüzde gösteriliyor, okunabilir olmalı. ApiError
    // dönmesi de önemli: çağrı yerleri 402'yi (kredi yetersiz) durum koduna
    // bakarak ayırıyor.
    const text = await res.text();
    let message = `API error ${res.status}`;
    let retryAfterSeconds: number | undefined;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
      if (typeof parsed?.retryAfterSeconds === "number") retryAfterSeconds = parsed.retryAfterSeconds;
    } catch {
      if (text) message = text;
    }
    throw new ApiError(message, res.status, retryAfterSeconds);
  }
  return parseResponse<T>(res);
}

/**
 * İptal edilmiş istek hatası mı?
 *
 * Bileşen sayfa değişiminde isteği iptal ettiğinde ortaya çıkan hata bir arıza
 * değildir; kullanıcıya gösterilmemeli. `.catch(ignoreAbort)` ile yutulabilir:
 *   api.get(path, ac.signal).then(setX).catch(ignoreAbort);
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** İptal hatalarını yutar, gerçek hatayı yeniden fırlatır. */
export function ignoreAbort(error: unknown): void {
  if (!isAbortError(error)) throw error;
}

export const api = {
  // signal isteğe bağlı ama GET'te önemli: kullanıcı kenar çubuğundan hızlıca
  // proje A → B → C gezdiğinde, geç dönen A yanıtı C'nin ekranını eziyordu
  // (kullanıcı yanlış projenin verisini görüyor). Efektte bir AbortController
  // açıp temizlikte abort etmek bunu kökünden çözer:
  //   useEffect(() => { const ac = new AbortController();
  //     api.get(path, ac.signal).then(setX).catch(ignoreAbort);
  //     return () => ac.abort(); }, [path]);
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), signal }),
  patch: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), signal }),
  // keepalive: true — sekme/pencere kapatılırken de isteğin tamamlanmasına izin
  // verir. Özellikle geciktirilmiş silme akışının (bkz. lib/undo.tsx pushDestructive)
  // beforeunload sırasında attığı "flush" isteği için kritik: keepalive olmadan
  // tarayıcı bu isteği sayfa kapanırken iptal edebilir, kayıt "silinmiş" görünüp
  // sunucuda hâlâ durabilir.
  // Gövde isteğe bağlı: hesap silme şifre doğrulaması istiyor (bkz. DeleteAccountModal).
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      keepalive: true,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  uploadFile: <T>(path: string, formData: FormData, signal?: AbortSignal) => uploadFile<T>(path, formData, signal),
};
