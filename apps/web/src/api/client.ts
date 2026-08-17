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
    public readonly status: number
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("projelio_token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let message = `API error ${res.status}`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.message) message = Array.isArray(parsed.message) ? parsed.message.join(", ") : parsed.message;
    } catch {
      if (text) message = text;
    }
    // Token'la gidip 401 aldıysak token artık geçersizdir. Giriş denemesinin
    // kendisi (henüz token yok) bu yola girmez; oradaki 401 "şifre yanlış"tır.
    if (res.status === 401 && token) handleExpiredSession();
    throw new ApiError(message, res.status);
  }
  return parseResponse<T>(res);
}

async function uploadFile<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem("projelio_token");
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 401 && token) handleExpiredSession();
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return parseResponse<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  // keepalive: true — sekme/pencere kapatılırken de isteğin tamamlanmasına izin
  // verir. Özellikle geciktirilmiş silme akışının (bkz. lib/undo.tsx pushDestructive)
  // beforeunload sırasında attığı "flush" isteği için kritik: keepalive olmadan
  // tarayıcı bu isteği sayfa kapanırken iptal edebilir, kayıt "silinmiş" görünüp
  // sunucuda hâlâ durabilir.
  delete: <T>(path: string) => request<T>(path, { method: "DELETE", keepalive: true }),
  uploadFile: <T>(path: string, formData: FormData) => uploadFile<T>(path, formData),
};
