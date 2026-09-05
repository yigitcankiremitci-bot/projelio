import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "./i18n";

/**
 * Tarayıcı sesi kayıtları için MIME adayları.
 *
 * Sıra önemli: Whisper hepsini kabul ediyor ama tarayıcılar aynı biçimi
 * desteklemiyor. Chrome/Firefox webm+opus üretir, Safari yalnızca mp4/aac.
 * Desteklenmeyen bir tür verilirse MediaRecorder kurulurken patlar, o yüzden
 * ilk desteklenen seçilir.
 */
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];

/** Kazara açık kalan mikrofona karşı üst sınır; ses ücreti süreyle artıyor. */
const MAX_SECONDS = 120;

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type));
}

export interface VoiceRecorder {
  supported: boolean;
  recording: boolean;
  /** Kaydın kaçıncı saniyesinde olduğumuz — ücret süreyle arttığı için gösteriliyor. */
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  /** Kaydı bitirir ve dosyayı döner; kayıt yoksa null. */
  stop: () => Promise<File | null>;
  cancel: () => void;
}

/**
 * Mikrofonla kısa ses kaydı alır.
 *
 * Kayıt sunucuya gönderilip yazıya çevriliyor (bkz. /ai/transcribe). Tarayıcının
 * kendi konuşma tanıma API'si (webkitSpeechRecognition) yerine bu yol seçildi:
 * o API yalnızca Chrome'da güvenilir çalışıyor, Türkçede belirgin şekilde daha
 * zayıf ve sunucuda zaten çalışan bir çözümleme hattımız var.
 *
 * Mikrofon izni ve akış temizliği burada toplanıyor: akış kapatılmazsa
 * tarayıcı sekmesinde kayıt göstergesi yanık kalıyor.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    // Akışı kapatmak şart: kapatılmazsa sekmedeki kayıt göstergesi yanık kalır
    // ve kullanıcı dinlendiğini sanır.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    setSeconds(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (!supported) {
      setError(t("Bu tarayıcı ses kaydını desteklemiyor."));
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);

      let elapsed = 0;
      timerRef.current = setInterval(() => {
        elapsed += 1;
        setSeconds(elapsed);
        // Üst sınıra gelince kayıt kendiliğinden durur; ses ücreti süreyle
        // arttığı için unutulmuş bir mikrofon pahalıya patlıyor. Sayaç
        // güncelleyicisinin İÇİNDE durdurmuyoruz: React geliştirme modunda
        // güncelleyiciyi iki kez çağırıyor ve yan etki iki kez işlerdi.
        if (elapsed >= MAX_SECONDS) recorderRef.current?.stop();
      }, 1000);
    } catch (err: any) {
      cleanup();
      setError(
        err?.name === "NotAllowedError"
          ? "Mikrofon izni verilmedi. Tarayıcı adres çubuğundaki izin simgesinden açabilirsin."
          : "Mikrofona erişilemedi."
      );
    }
  }, [supported, cleanup]);

  const stop = useCallback(async (): Promise<File | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;

    const collect = (): Blob | null => {
      const type = recorder.mimeType || "audio/webm";
      return chunksRef.current.length ? new Blob(chunksRef.current, { type }) : null;
    };

    const blob = await new Promise<Blob | null>((resolve) => {
      // Kayıt üst sınıra takılıp KENDİ KENDİNE durmuş olabilir. O durumda veri
      // chunksRef'te hazır bekliyor; "inactive" görüp null dönmek, kullanıcının
      // iki dakikalık kaydını sessizce çöpe atmak olurdu.
      if (recorder.state === "inactive") {
        resolve(collect());
        return;
      }
      recorder.onstop = () => resolve(collect());
      recorder.stop();
    });

    cleanup();
    if (!blob || blob.size < 1000) return null;

    // Uzantı sunucu tarafında biçim tespitine yardım ediyor (bkz. effectiveMime).
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
    return new File([blob], `komut.${ext}`, { type: blob.type });
  }, [cleanup]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    cleanup();
  }, [cleanup]);

  return { supported, recording, seconds, error, start, stop, cancel };
}
