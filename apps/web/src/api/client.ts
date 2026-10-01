import { getSocketId } from "../lib/socketId";
import { etkinDil } from "../lib/i18n/depo";
import { sendWithProgress } from "../lib/xhrUpload";
import { sunucuZamanlariniIsaretle } from "../lib/sunucuZamani";
import {
  KISMI_BAGLANTI_BEKLEME_MS,
  bekleyenleriUygula,
  onbellegeAlinirMi,
  onbellekAnahtari,
  oturumSahibi,
  sunucuyaUlasilamadiMi,
} from "../lib/cevrimdisi";
import {
  agYok,
  bekleyenYazmalar,
  cevrimdisiEtkin,
  cevrimdisiKur,
  eskiVeriGosterildiIsaretle,
  kuyrugaAl,
  kuyrukBosMu,
  kuyruguGonder,
  oturumsuzTemizle,
  sakliYanitiOku,
  ulasildi,
  ulasilamadi,
  yanitiSakla,
} from "../lib/cevrimdisiDepo";

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

async function parseResponse<T>(res: Response, hamGovde?: (text: string) => void): Promise<T> {
  const text = await res.text();
  hamGovde?.(text);
  return metniCoz<T>(text);
}

function metniCoz<T>(text: string): T {
  if (!text) return undefined as T;
  try {
    // Eksiz zaman damgaları burada bir kez UTC diye işaretleniyor; yoksa her
    // ekran onları yerel saat sanıyordu (bkz. lib/sunucuZamani.ts).
    return sunucuZamanlariniIsaretle(JSON.parse(text)) as T;
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
function signalWithTimeout(
  caller: AbortSignal | null | undefined,
  timeoutMs = REQUEST_TIMEOUT_MS
): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal =
    caller && typeof AbortSignal.any === "function" ? AbortSignal.any([caller, controller.signal]) : controller.signal;
  return { signal, done: () => clearTimeout(timer) };
}

type IstekSecenekleri = RequestInit & { timeoutMs?: number };

async function agaGit<T>(path: string, options: IstekSecenekleri, hamGovde?: (text: string) => void): Promise<T> {
  const token = localStorage.getItem("projelio_token");
  // Açık soketin kimliği: sunucu bundan isteğin HANGİ SAYFADAN geldiğini bulup
  // değişikliği o sayfadaki diğer kullanıcılara duyuruyor (bkz. lib/liveRoom.ts
  // ve backend realtime.interceptor.ts). Yoksa (soket kapalı) sinyal gitmez,
  // istek normal çalışır.
  const socketId = getSocketId();
  // Sunucunun ürettiği hata mesajları arayüzle AYNI dilde dönmeli. Sunucu bunu
  // veritabanından okuyamıyor (hata yolunda sorgu istemiyoruz) ve jetondan da
  // okuyamıyor (jeton 7 gün yaşıyor, dil değişirse bayatlar) — istemci hangi
  // dili gösterdiğini zaten biliyor, o yüzden burada yazılıyor.
  // Bkz. backend common/filters/all-exceptions.filter.ts.
  const locale = etkinDil();
  const timeout = signalWithTimeout(options.signal, options.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: timeout.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(socketId ? { "X-Socket-Id": socketId } : {}),
        ...(locale ? { "X-Projelio-Locale": locale } : {}),
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
  return parseResponse<T>(res, hamGovde);
}

const CEVRIMDISI_MESAJI = "İnternet bağlantısı yok. Bağlantı gelince tekrar dene.";

/**
 * Her isteğin girdiği kapı: tarayıcıda doğrudan ağa gider; mobil kabukta
 * çevrimdışı katmanından geçer (bkz. lib/cevrimdisi.ts başı).
 *
 * Kabukta:
 * - GET başarılıysa yanıt cihazda saklanır; sunucuya ulaşılamazsa saklı olan
 *   döner. Saklı yanıt varken "kısmen kopuk" bağlantıda 30 sn beklenmez.
 * - Yazma, cihaz ağsızken hiç denenmez — 30 sn dönen düğme yerine anında hata.
 * - 401 akışı aynen agaGit içinde; burada oturum hakkında hiçbir karar yok.
 */
async function request<T>(path: string, options: IstekSecenekleri = {}): Promise<T> {
  if (!cevrimdisiEtkin()) return agaGit<T>(path, options);
  const token = localStorage.getItem("projelio_token");
  if (!token) oturumsuzTemizle();
  const method = (options.method ?? "GET").toUpperCase();
  const sahip = oturumSahibi(token);
  const anahtar = method === "GET" && sahip && onbellegeAlinirMi(path) ? onbellekAnahtari(sahip, path) : null;

  // Bekleyen yazmalar gönderilene dek GET yanıtına (saklı ya da taze) işlenir.
  const bekleyenleIsle = (veri: T): T => bekleyenleriUygula(veri, bekleyenYazmalar());

  if (agYok()) {
    const sakli = anahtar ? await sakliYanitiOku(anahtar) : undefined;
    if (sakli !== undefined) {
      eskiVeriGosterildiIsaretle();
      return bekleyenleIsle(metniCoz<T>(sakli));
    }
    ulasilamadi();
    throw new ApiError(CEVRIMDISI_MESAJI, 0);
  }

  const ag = agaGit<T>(path, options, anahtar ? (text) => void yanitiSakla(anahtar, text) : undefined).then(
    (sonuc) => {
      ulasildi();
      return method === "GET" ? bekleyenleIsle(sonuc) : sonuc;
    },
    (error: unknown) => {
      if (error instanceof ApiError) {
        if (sunucuyaUlasilamadiMi(error.status)) ulasilamadi();
        else ulasildi();
      }
      throw error;
    }
  );
  if (!anahtar) return ag;

  const sakliyiVer = async (error?: unknown): Promise<T> => {
    const sakli = await sakliYanitiOku(anahtar);
    if (sakli === undefined) {
      if (error !== undefined) throw error;
      return ag; // saklı yok: ağı sonuna dek bekle
    }
    eskiVeriGosterildiIsaretle();
    return bekleyenleIsle(metniCoz<T>(sakli));
  };

  let bekleme: ReturnType<typeof setTimeout> | undefined;
  const yavas = new Promise<T>((resolve, reject) => {
    bekleme = setTimeout(() => sakliyiVer().then(resolve, reject), KISMI_BAGLANTI_BEKLEME_MS);
  });
  try {
    return await Promise.race([ag, yavas]);
  } catch (error) {
    // Çağıranın iptali ve sunucunun gerçek cevabı (403, 404…) olduğu gibi gider;
    // yalnızca "ulaşılamadı" saklı veriyle karşılanır.
    if (options.signal?.aborted) throw error;
    if (error instanceof ApiError && sunucuyaUlasilamadiMi(error.status)) return sakliyiVer(error);
    throw error;
  } finally {
    clearTimeout(bekleme);
    // Yarışı saklı veri kazandıysa ağ isteği arkada sürer; reddi sahipsiz kalmasın.
    ag.catch(() => {});
  }
}

/**
 * Sonucu kullanılmayan, değeri SET eden bir yazma: bağlantı yoksa kuyruğa
 * alınır ve bağlantı gelince gönderilir; çağırana başarılı gibi döner.
 *
 * Yalnızca şu koşulları sağlayan yerde kullan: (1) dönen gövdeye ihtiyaç yok,
 * ekran zaten iyimser güncellendi; (2) aynı isteği iki kez göndermek zararsız
 * (zaman aşımına uğrayan istek sunucuya ulaşmış olabilir, kuyruk onu yeniden
 * gönderir); (3) gövdedeki itemId/id hedefi tanımlar (bkz. kuyrugaEkle).
 * Kayıt OLUŞTURAN ya da para hareketi yazan uçlar bu koşulları sağlamaz.
 *
 * Dönüş: true = şimdi gönderildi, false = kuyrukta bekliyor. Gönderimden sonra
 * listeyi yeniden çeken yer bunu bilmeli — kuyruktayken yeniden çekmek saklı
 * veriyi getirir, iyimser güncellemeyi ezmese de boşuna istek olur.
 */
async function kuyrukluPatch(path: string, body: unknown): Promise<boolean> {
  const yaz = () => request<unknown>(path, { method: "PATCH", body: JSON.stringify(body) });
  if (!cevrimdisiEtkin()) {
    yazmaBitti(await yaz(), "PATCH", path, body);
    return true;
  }
  const yazma = { method: "PATCH" as const, path, body, zaman: Date.now() };
  // Önde bekleyen varsa sıranın arkasına geç: "tamamlandı" kuyrukta dururken
  // "geri al" doğrudan giderse sunucuda ters sırayla uygulanır.
  if (agYok() || !kuyrukBosMu()) {
    kuyrugaAl(yazma);
    void kuyruguGonder();
    return false;
  }
  try {
    yazmaBitti(await yaz(), "PATCH", path, body);
    return true;
  } catch (error) {
    if (error instanceof ApiError && sunucuyaUlasilamadiMi(error.status)) {
      kuyrugaAl(yazma);
      return false;
    }
    throw error;
  }
}

async function uploadFile<T>(
  path: string,
  formData: FormData,
  signal?: AbortSignal,
  /** Verilirse istek XHR ile gider ve gönderilen bayt bildirilir (bkz. lib/xhrUpload.ts). */
  onProgress?: (loadedBytes: number) => void
): Promise<T> {
  const token = localStorage.getItem("projelio_token");
  const init = {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } as Record<string, string>,
    body: formData,
    // İptal edilebilsin diye: kullanıcı yanlış dosya seçtiğinde yüklemenin
    // bitmesini beklemek zorunda kalmasın (bkz. FilesPanel iptal düğmesi).
    signal,
  };
  const res = onProgress
    ? await sendWithProgress(`${API_URL}${path}`, init, onProgress)
    : await fetch(`${API_URL}${path}`, init);
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

/**
 * Başarıyla tamamlanan yazma isteklerini izleyenler.
 *
 * NEDEN: bazı yan davranışlar "kullanıcı şunu yaptı" anına bağlı ama o iş
 * onlarca bileşende ayrı ayrı yapılıyor — ör. görev tamamlama 10 dosyada
 * kendi PATCH'iyle. Değerlendirme isteği (lib/degerlendirmeIstegi.ts) buradan
 * dinliyor ki her bileşene bir satır eklemek gerekmesin.
 *
 * Yalnızca BAŞARILI istekten SONRA çağrılır; oturum ve hata akışına hiçbir
 * etkisi yoktur. Dinleyicinin hatası yutulur — isteği yapanın sonucu
 * bir yan davranış yüzünden bozulmamalı.
 */
type YazmaDinleyicisi = (method: string, path: string, body: unknown) => void;
const yazmaDinleyicileri = new Set<YazmaDinleyicisi>();

export function basariliYazmayiDinle(fn: YazmaDinleyicisi): () => void {
  yazmaDinleyicileri.add(fn);
  return () => {
    yazmaDinleyicileri.delete(fn);
  };
}

function yazmaBitti<T>(sonuc: T, method: string, path: string, body: unknown): T {
  for (const fn of yazmaDinleyicileri) {
    try {
      fn(method, path, body);
    } catch {
      /* yan davranış; isteğin sonucunu etkilemez */
    }
  }
  return sonuc;
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
  // timeoutMs: bilerek uzun süren işler için (ör. Lio'nun video izlemesi —
  // indirme + kare + ses çözümleme 30 sn'yi rahatça aşıyor). Varsayılan 30 sn.
  post: <T>(path: string, body: unknown, signal?: AbortSignal, timeoutMs?: number) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body), signal, timeoutMs }),
  patch: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body), signal }).then((sonuc) =>
      yazmaBitti(sonuc, "PATCH", path, body)
    ),
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
  uploadFile: <T>(path: string, formData: FormData, signal?: AbortSignal, onProgress?: (loadedBytes: number) => void) =>
    uploadFile<T>(path, formData, signal, onProgress),
  // Bağlantı yokken kuyruğa alınan PATCH — koşulları kuyrukluPatch başında.
  patchKuyruklu: (path: string, body: unknown) => kuyrukluPatch(path, body),
};

// Mobil kabukta kuyruğun gönderilmesi ve sunucunun yoklanması (tarayıcıda no-op).
cevrimdisiKur({
  sahip: () => oturumSahibi(localStorage.getItem("projelio_token")),
  gonder: (y) =>
    request<unknown>(y.path, { method: y.method, body: JSON.stringify(y.body) }).then((sonuc) =>
      yazmaBitti(sonuc, y.method, y.path, y.body)
    ),
  yokla: async () => {
    const t = signalWithTimeout(undefined, 5_000);
    try {
      return (await fetch(`${API_URL}/health`, { signal: t.signal })).ok;
    } catch {
      return false;
    } finally {
      t.done();
    }
  },
});
