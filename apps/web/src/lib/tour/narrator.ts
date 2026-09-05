/**
 * Turun ses motoru.
 *
 * İki kaynağı sırayla dener:
 *  1. Önceden kaydedilmiş ses:  public/tour-audio/tr/<turId>/<adimId>.mp3
 *     (seslendirmenden ya da AI seslendirmeden gelen dosyalar buraya konur)
 *  2. Dosya yoksa/çalınamazsa: tarayıcının kendi konuşma sentezi (Web Speech API)
 *
 * Yani bugün hiç ses dosyası olmadan çalışır; ileride mp3'ler aynı isimle
 * public/tour-audio/tr/ altına konduğunda KOD DEĞİŞMEDEN otomatik olarak
 * gerçek seslendirmeye geçer. Bir turun yalnızca bazı adımlarının sesi
 * yüklenmiş olması da sorun değil — adım adım karar verilir.
 */

import type { TourStep } from "./types";
import { getLocale } from "../i18n/depo";

export type NarrationSource = "audio" | "tts" | "none";

const AUDIO_BASE = "/tour-audio";

/**
 * Kaydın dili. Yol zaten dil segmenti taşıyordu (`/tour-audio/tr/…`), ama sabit
 * "tr" yazılıydı: İngilizce arayüzde İngilizce metin TÜRKÇE sesle okunurdu.
 * Artık arayüzün diline bakılıyor; o dilde kayıt yoksa dosya bulunamıyor ve
 * anlatım cihazın kendi sesine düşüyor (bkz. aşağıdaki üç kademeli akış).
 * İngilizce kayıtlar yüklendiğinde KOD DEĞİŞMEDEN devreye girer.
 */
export function narrationLang(): string {
  return getLocale() ?? (navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en");
}

/** Bu adımın kaydedilmiş ses dosyasının beklendiği yol. */
export function stepAudioUrl(tourId: string, stepId: string): string {
  return `${AUDIO_BASE}/${narrationLang()}/${tourId}/${stepId}.mp3`;
}

export function speechTextOf(step: TourStep): string {
  return (step.speech ?? step.text).replace(/\s+/g, " ").trim();
}

/**
 * Metni SESLENDİRİLEBİLİR hâle getirir.
 *
 * Tur metinleri düz yazı ama Lio'nun cevapları öyle değil: markdown yıldızları,
 * başlık işaretleri ve emoji içeriyorlar. Tarayıcının konuşma sentezi bunları
 * harfiyen okuyor — "yıldız yıldız Tamamlandı yıldız yıldız", "onay işareti" —
 * ve sesi kullanılamaz hâle getiriyordu. Temizlik burada yapılıyor ki hem Lio
 * hem tur aynı davranışı görsün.
 *
 * Noktalama KORUNUR: konuşma sentezi duraklamalarını ondan çıkarıyor.
 */
export function sanitizeForSpeech(raw: string): string {
  return (
    raw
      // Kod blokları ve satır içi kod: içerik okunur, ters tırnak okunmaz.
      .replace(/```[a-zA-Z]*\n?/g, "")
      .replace(/`([^`]+)`/g, "$1")
      // Bağlantılar: yalnızca görünen metin okunur, adres okunmaz.
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Kalın/italik işaretleri.
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,;:!?]|$)/g, "$1$2")
      // Satır başındaki başlık ve liste işaretleri.
      .replace(/^\s*#{1,6}\s*/gm, "")
      .replace(/^\s*[-*•]\s+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      // Ayraç olarak kullanılan orta nokta ve tire, cümle içinde virgül gibi okunsun.
      .replace(/\s+[·—–]\s+/g, ", ")
      // Emoji ve simgeler: adları okunuyor ("onay işareti"), atılıyorlar.
      .replace(
        /[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F\u{1F000}-\u{1FAFF}]/gu,
        " "
      )
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * 404 veren ses yolları burada tutulur: aynı adım tekrar oynatıldığında
 * boşuna bir istek daha atılmasın, doğrudan TTS'e düşülsün.
 */
const missingAudio = new Set<string>();

/* ------------------------------------------------------------------ */
/* Konuşma sentezi (TTS)                                               */
/* ------------------------------------------------------------------ */

const ttsSupported = (): boolean =>
  typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined";

let cachedVoice: SpeechSynthesisVoice | null = null;
/** Kullanıcının elle seçtiği ses adı; otomatik seçimi ezer. */
let preferredVoiceName: string | null = null;

/** Cihazdaki Türkçe sesler — kullanıcıya seçtirmek için. */
/**
 * Cihazda arayüz dilinde okuyabilen sesler.
 *
 * Eskiden yalnızca Türkçe seslere bakıyordu; İngilizce arayüzde hiç ses
 * bulunamıyor ve anlatım tamamen sessiz kalıyordu.
 */
export function narrationVoices(): { name: string; lang: string }[] {
  if (!ttsSupported()) return [];
  const dil = narrationLang();
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang?.toLowerCase().startsWith(dil))
    .map((v) => ({ name: v.name, lang: v.lang }));
}

/**
 * Sesi elle seçer.
 *
 * Otomatik seçim her cihazda isabet etmiyor: aynı dilde üç ses varken hangisinin
 * doğal duyulduğu kişiden kişiye değişiyor ve "gelişmiş" sözcüğü her üründe
 * geçmiyor. Kullanıcı bir kez seçsin, biz ona uyalım.
 */
export function setPreferredVoice(name: string | null): void {
  preferredVoiceName = name;
  cachedVoice = null;
  pickVoice();
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const dil = narrationLang();
  const dildekiler = voices.filter((v) => v.lang?.toLowerCase().startsWith(dil));

  const chosen = preferredVoiceName
    ? dildekiler.find((v) => v.name === preferredVoiceName)
    : undefined;

  // Aynı dilde birden çok ses varsa "gelişmiş" olanlar belirgin biçimde daha
  // doğal okuyor; adlarında genelde bu sözcükler geçiyor.
  cachedVoice =
    chosen ??
    dildekiler.find((v) => /google|natural|premium|enhanced|gelişmiş|siri/i.test(v.name)) ??
    dildekiler[0] ??
    null;
  return cachedVoice;
}

if (ttsSupported()) {
  pickVoice();
  // Chrome sesleri eşzamansız yükler: ilk çağrıda liste boş dönebilir.
  window.speechSynthesis.addEventListener?.("voiceschanged", () => {
    pickVoice();
  });
}

/** Cihazda Türkçe bir ses var mı? (Ayarlarda kullanıcıyı bilgilendirmek için.) */
export function hasTurkishVoice(): boolean {
  return Boolean(cachedVoice ?? pickVoice());
}

export function narrationAvailable(): boolean {
  return ttsSupported();
}

/**
 * Uzun metni cümlelere böler.
 *
 * İki nedenle: (1) Chrome'da tek seferde okunan uzun metin ~15 saniye sonra
 * sessizce kesiliyor, (2) parça parça okuyunca duraklat/ilerlet çok daha
 * hızlı tepki veriyor.
 */
export function splitForSpeech(text: string, maxLen = 180): string[] {
  const sentences = text.split(/(?<=[.!?…:])\s+/).filter(Boolean);
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (!buf) {
      buf = s;
    } else if (buf.length + 1 + s.length <= maxLen) {
      buf = `${buf} ${s}`;
    } else {
      out.push(buf);
      buf = s;
    }
  }
  if (buf) out.push(buf);
  // Tek bir cümle bile çok uzunsa kelime sınırından kır.
  return out.flatMap((chunk) => {
    if (chunk.length <= maxLen * 1.6) return [chunk];
    const words = chunk.split(" ");
    const parts: string[] = [];
    let cur = "";
    for (const w of words) {
      if (cur && cur.length + 1 + w.length > maxLen) {
        parts.push(cur);
        cur = w;
      } else {
        cur = cur ? `${cur} ${w}` : w;
      }
    }
    if (cur) parts.push(cur);
    return parts;
  });
}

/* ------------------------------------------------------------------ */
/* Oynatıcı                                                            */
/* ------------------------------------------------------------------ */

export interface PlayArgs {
  text: string;
  /** Kaydedilmiş ses yolu; verilmezse doğrudan TTS kullanılır. */
  audioUrl?: string;
  rate?: number;
  /** Ses gerçekten hangi kaynaktan çalmaya başladı? */
  onSource?: (source: NarrationSource) => void;
  /** Anlatım bittiğinde (kesilerek değil, doğal olarak). */
  onEnd?: () => void;
}

let audioEl: HTMLAudioElement | null = null;
let chunks: string[] = [];
let chunkIndex = 0;
let activeRate = 1;
let endCallback: (() => void) | null = null;
/**
 * Her yeni play() çağrısı jetonu artırır; eski oynatmanın geciken olayları
 * (ör. iptal edilmiş bir utterance'ın onend'i) yeni adımı ilerletmesin diye
 * tüm geri çağrılar jetonu kontrol eder.
 */
let token = 0;
let keepAlive: ReturnType<typeof setInterval> | null = null;

function clearKeepAlive() {
  if (keepAlive !== null) {
    clearInterval(keepAlive);
    keepAlive = null;
  }
}

/**
 * Chrome'un uzun konuşmalarda sentezi kendiliğinden durdurma hatasına karşı
 * düzenli aralıkla pause/resume yapılır. (Parçalama ile birlikte ikinci güvence.)
 */
function startKeepAlive() {
  clearKeepAlive();
  if (!ttsSupported()) return;
  keepAlive = setInterval(() => {
    const s = window.speechSynthesis;
    if (s.speaking && !s.paused) {
      s.pause();
      s.resume();
    }
  }, 8000);
}

function speakNextChunk(myToken: number) {
  if (myToken !== token || !ttsSupported()) return;
  if (chunkIndex >= chunks.length) {
    clearKeepAlive();
    const cb = endCallback;
    endCallback = null;
    cb?.();
    return;
  }
  const utter = new SpeechSynthesisUtterance(chunks[chunkIndex]);
  utter.lang = cachedVoice?.lang ?? "tr-TR";
  if (cachedVoice) utter.voice = cachedVoice;
  utter.rate = activeRate;
  utter.pitch = 1;
  utter.onend = () => {
    if (myToken !== token) return;
    chunkIndex += 1;
    speakNextChunk(myToken);
  };
  utter.onerror = () => {
    if (myToken !== token) return;
    // "interrupted"/"canceled" zaten stop() kaynaklıdır; gerçek bir hata ise
    // takılıp kalmamak için sonraki parçaya geçilir.
    chunkIndex += 1;
    speakNextChunk(myToken);
  };
  window.speechSynthesis.speak(utter);
}

function speak(text: string, myToken: number) {
  if (!ttsSupported()) {
    const cb = endCallback;
    endCallback = null;
    cb?.();
    return;
  }
  window.speechSynthesis.cancel();
  if (!cachedVoice) pickVoice();
  chunks = splitForSpeech(text);
  chunkIndex = 0;
  startKeepAlive();
  speakNextChunk(myToken);
}

export function play({ text, audioUrl, rate = 1, onSource, onEnd }: PlayArgs): void {
  stop();
  const myToken = ++token;
  activeRate = rate;
  endCallback = () => {
    if (myToken !== token) return;
    onEnd?.();
  };

  const useTts = () => {
    if (myToken !== token) return;
    if (!ttsSupported()) {
      onSource?.("none");
      const cb = endCallback;
      endCallback = null;
      cb?.();
      return;
    }
    onSource?.("tts");
    // Sentez motoruna markdown/emoji gitmemeli (bkz. sanitizeForSpeech).
    speak(sanitizeForSpeech(text), myToken);
  };

  if (!audioUrl || missingAudio.has(audioUrl)) {
    useTts();
    return;
  }

  const el = new Audio(audioUrl);
  el.preload = "auto";
  el.playbackRate = rate;
  audioEl = el;

  const fallback = () => {
    if (myToken !== token) return;
    // data: adresleri her seferinde farklı ve tek kullanımlık; listeye
    // yazmak belleği şişirir, tekrar denenmeyecekleri için de gereksiz.
    if (!audioUrl.startsWith("data:")) missingAudio.add(audioUrl);
    if (audioEl === el) audioEl = null;
    useTts();
  };

  el.addEventListener("error", fallback);
  // Dosya yoksa dev sunucusu bazen HTML döndürür: çalınamaz, "error" yerine
  // yalnızca süre NaN kalır — o durumda da yedeğe düşülür.
  el.addEventListener("loadedmetadata", () => {
    if (myToken !== token) return;
    if (!Number.isFinite(el.duration) || el.duration === 0) fallback();
  });
  el.addEventListener("ended", () => {
    if (myToken !== token) return;
    const cb = endCallback;
    endCallback = null;
    cb?.();
  });

  el.play()
    .then(() => {
      if (myToken !== token) return;
      onSource?.("audio");
    })
    .catch(fallback);
}

export function pause(): void {
  audioEl?.pause();
  if (ttsSupported() && window.speechSynthesis.speaking) window.speechSynthesis.pause();
}

export function resume(): void {
  void audioEl?.play().catch(() => undefined);
  if (ttsSupported() && window.speechSynthesis.paused) window.speechSynthesis.resume();
}

export function stop(): void {
  token += 1;
  endCallback = null;
  clearKeepAlive();
  if (audioEl) {
    audioEl.pause();
    audioEl.src = "";
    audioEl = null;
  }
  chunks = [];
  chunkIndex = 0;
  if (ttsSupported()) window.speechSynthesis.cancel();
}

/** Yalnızca kaydedilmiş ses için anlamlı; TTS'te hız yeni parçadan itibaren geçerli olur. */
export function setRate(rate: number): void {
  activeRate = rate;
  if (audioEl) audioEl.playbackRate = rate;
}
