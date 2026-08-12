/**
 * Turun durumu ve kontrolü.
 *
 * Sağlayıcı yalnızca "hangi tur, hangi adım, ses çalıyor mu" bilgisini tutar;
 * çizim işini components/tour/TourOverlay yapar. Böylece herhangi bir bileşen
 * (bir alanın yanındaki küçük soru işareti dahil) useTour().start(...) ile
 * turu istediği adımdan başlatabilir.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Tour, TourStep } from "./types";
import { TOURS, getTour, toursForPath } from "./tours";
import * as narrator from "./narrator";

const STORAGE_SEEN = "projelio_tour_seen_v1";
const STORAGE_VOICE = "projelio_tour_voice_v1";
const STORAGE_RATE = "projelio_tour_rate_v1";
const STORAGE_AUTO = "projelio_tour_autoadvance_v1";

function readSeen(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_SEEN);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  return raw === null ? fallback : raw === "1";
}

interface TourApi {
  tour: Tour | null;
  step: TourStep | null;
  stepIndex: number;
  stepCount: number;
  /** Anlatım şu anda çalıyor mu (duraklatılmadı mı)? */
  speaking: boolean;
  /** Ses gerçekten hangi kaynaktan geliyor: kayıt mı, tarayıcı sesi mi? */
  source: narrator.NarrationSource;
  voiceEnabled: boolean;
  rate: number;
  autoAdvance: boolean;
  seen: string[];

  start: (tourId: string, opts?: { fromStepId?: string }) => void;
  stop: (opts?: { completed?: boolean }) => void;
  next: () => void;
  prev: () => void;
  goTo: (index: number) => void;
  togglePlay: () => void;
  setVoiceEnabled: (on: boolean) => void;
  setRate: (rate: number) => void;
  setAutoAdvance: (on: boolean) => void;
  /** Overlay, hedef öğeyi bulamadığında çağırır (bkz. TourStep.optional). */
  reportAnchorMissing: (index: number) => void;

  /** Bu rotayla ilgili turlar. */
  toursHere: Tour[];
  allTours: Tour[];
}

const Ctx = createContext<TourApi | null>(null);

export function useTour(): TourApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTour, TourProvider içinde kullanılmalı");
  return ctx;
}

export function TourProvider({
  children,
  autoStartEnabled = false,
}: {
  children: ReactNode;
  /**
   * Kendiliğinden başlayan turlar yalnızca bu true iken devreye girer.
   * (Kurulum sihirbazı açıkken ya da kullanıcı henüz yüklenmemişken false.)
   */
  autoStartEnabled?: boolean;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const [tourId, setTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [source, setSource] = useState<narrator.NarrationSource>("none");
  const [voiceEnabled, setVoiceEnabledState] = useState(() => readBool(STORAGE_VOICE, true));
  const [autoAdvance, setAutoAdvanceState] = useState(() => readBool(STORAGE_AUTO, true));
  const [rate, setRateState] = useState(() => {
    const raw = Number(localStorage.getItem(STORAGE_RATE));
    return Number.isFinite(raw) && raw >= 0.5 && raw <= 2 ? raw : 1;
  });
  const [seen, setSeen] = useState<string[]>(() => readSeen());
  /** Son yön: eksik (optional) adım atlanırken hangi tarafa gidileceğini belirler. */
  const directionRef = useRef<1 | -1>(1);

  const tour = tourId ? getTour(tourId) ?? null : null;
  const step = tour ? tour.steps[stepIndex] ?? null : null;

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(STORAGE_SEEN, JSON.stringify(next));
      } catch {
        /* depolama kapalıysa tur yine çalışsın, sadece "görüldü" hatırlanmaz */
      }
      return next;
    });
  }, []);

  const stop = useCallback(
    (opts?: { completed?: boolean }) => {
      narrator.stop();
      setSpeaking(false);
      setSource("none");
      // Tamamlanan da yarıda bırakılan da "görüldü" sayılır: kullanıcı kapattıysa
      // bir daha kendiliğinden açılmasın. Yardım menüsünden istediği an tekrar
      // başlatabilir (bkz. TourLauncher).
      if (tourId) markSeen(tourId);
      setTourId(null);
      setStepIndex(0);
    },
    [tourId, markSeen]
  );

  const start = useCallback(
    (id: string, opts?: { fromStepId?: string }) => {
      const t = getTour(id);
      if (!t || t.steps.length === 0) return;
      narrator.stop();
      directionRef.current = 1;
      const index = opts?.fromStepId ? Math.max(0, t.steps.findIndex((s) => s.id === opts.fromStepId)) : 0;
      setTourId(id);
      setStepIndex(index);
    },
    []
  );

  const goTo = useCallback(
    (index: number) => {
      if (!tour) return;
      directionRef.current = index >= stepIndex ? 1 : -1;
      if (index < 0) return;
      if (index >= tour.steps.length) {
        stop({ completed: true });
        return;
      }
      setStepIndex(index);
    },
    [tour, stepIndex, stop]
  );

  const next = useCallback(() => goTo(stepIndex + 1), [goTo, stepIndex]);
  const prev = useCallback(() => goTo(Math.max(0, stepIndex - 1)), [goTo, stepIndex]);

  const reportAnchorMissing = useCallback(
    (index: number) => {
      if (!tour) return;
      const s = tour.steps[index];
      if (!s?.optional) return;
      const dir = directionRef.current;
      const target = index + dir;
      if (target < 0) {
        // İlk adımlar da eksikse turu ilk görünür adımda tut.
        setStepIndex(0);
        return;
      }
      if (target >= tour.steps.length) {
        stop({ completed: true });
        return;
      }
      setStepIndex(target);
    },
    [tour, stop]
  );

  /* --- adım değiştiğinde: gerekiyorsa gezin, sonra anlat --------------- */

  useEffect(() => {
    if (!tour || !step) return;
    if (step.navigateTo && step.navigateTo !== location.pathname + location.search) {
      navigate(step.navigateTo);
    }
    // navigate bağımlılığa eklenmiyor: her render'da yeni referans üretip
    // döngüye sokuyor. Adım/tur değişimi bu etkiyi tetiklemeye yeter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, stepIndex]);

  // Etkinin içinden güncel değerlere ulaşmak için (bağımlılığa ekleyip
  // anlatımı baştan başlatmadan).
  const autoAdvanceRef = useRef(autoAdvance);
  const nextRef = useRef(next);
  useEffect(() => {
    autoAdvanceRef.current = autoAdvance;
  }, [autoAdvance]);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  useEffect(() => {
    if (!tour || !step) {
      setSpeaking(false);
      return;
    }
    if (!voiceEnabled) {
      narrator.stop();
      setSpeaking(false);
      setSource("none");
      return;
    }
    narrator.play({
      text: narrator.speechTextOf(step),
      audioUrl: narrator.stepAudioUrl(tour.id, step.id),
      rate,
      onSource: setSource,
      onEnd: () => {
        setSpeaking(false);
        if (autoAdvanceRef.current) {
          // Kullanıcının okumayı bitirmesi için kısa bir nefes payı.
          window.setTimeout(() => nextRef.current(), 900);
        }
      },
    });
    setSpeaking(true);
    return () => {
      narrator.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour?.id, stepIndex, voiceEnabled]);

  /* --- kendiliğinden başlayan turlar ---------------------------------- */

  useEffect(() => {
    if (!autoStartEnabled || tourId) return;
    const candidate = TOURS.find(
      (t) => t.autoStart && !seen.includes(t.id) && t.match.test(location.pathname)
    );
    if (!candidate) return;
    // Sayfanın yerleşimi otursun, hedef öğeler DOM'a girsin diye kısa gecikme.
    const timer = window.setTimeout(() => start(candidate.id), 700);
    return () => window.clearTimeout(timer);
  }, [autoStartEnabled, tourId, seen, location.pathname, start]);

  /* --- klavye ---------------------------------------------------------- */

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tour, next, prev, stop]);

  /* --- tercihler ------------------------------------------------------- */

  const setVoiceEnabled = useCallback((on: boolean) => {
    setVoiceEnabledState(on);
    localStorage.setItem(STORAGE_VOICE, on ? "1" : "0");
    if (!on) narrator.stop();
  }, []);

  const setAutoAdvance = useCallback((on: boolean) => {
    setAutoAdvanceState(on);
    localStorage.setItem(STORAGE_AUTO, on ? "1" : "0");
  }, []);

  const setRate = useCallback((value: number) => {
    setRateState(value);
    localStorage.setItem(STORAGE_RATE, String(value));
    narrator.setRate(value);
  }, []);

  const togglePlay = useCallback(() => {
    setSpeaking((playing) => {
      if (playing) {
        narrator.pause();
        return false;
      }
      narrator.resume();
      return true;
    });
  }, []);

  const toursHere = useMemo(
    () => toursForPath(location.pathname, location.search),
    [location.pathname, location.search]
  );

  const value: TourApi = {
    tour,
    step,
    stepIndex,
    stepCount: tour?.steps.length ?? 0,
    speaking,
    source,
    voiceEnabled,
    rate,
    autoAdvance,
    seen,
    start,
    stop,
    next,
    prev,
    goTo,
    togglePlay,
    setVoiceEnabled,
    setRate,
    setAutoAdvance,
    reportAnchorMissing,
    toursHere,
    allTours: TOURS,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
