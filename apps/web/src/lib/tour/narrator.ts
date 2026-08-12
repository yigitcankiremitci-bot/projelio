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

export type NarrationSource = "audio" | "tts" | "none";

const AUDIO_BASE = "/tour-audio";
export const NARRATION_LANG = "tr";

/** Bu adımın kaydedilmiş ses dosyasının beklendiği yol. */
export function stepAudioUrl(tourId: string, stepId: string): string {
  return `${AUDIO_BASE}/${NARRATION_LANG}/${tourId}/${stepId}.mp3`;
}

export function speechTextOf(step: TourStep): string {
  return (step.speech ?? step.text).replace(/\s+/g, " ").trim();
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

function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const turkish = voices.filter((v) => v.lang?.toLowerCase().startsWith("tr"));
  // Aynı dilde birden çok ses varsa "gelişmiş" olanlar belirgin biçimde daha
  // doğal okuyor; adlarında genelde bu sözcükler geçiyor.
  cachedVoice =
    turkish.find((v) => /google|natural|premium|enhanced|siri/i.test(v.name)) ?? turkish[0] ?? null;
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
    speak(text, myToken);
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
    missingAudio.add(audioUrl);
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
