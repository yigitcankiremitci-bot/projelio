import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

/**
 * Cihaza özel arayüz tercihleri — hesaba değil TARAYICIYA bağlıdır
 * (bkz. lib/fontScale.ts ve theme/preferences.ts, aynı desen).
 *
 * Neden context: bunların çoğu Ayarlar'dan değiştirildiği anda uygulamanın
 * BAŞKA bir köşesini etkiliyor (Lio balonu, kişi şeridi, animasyonlar). Düz
 * localStorage okumasıyla değişiklik ancak sayfa yenilenince görünürdü.
 *
 * İstisna: "açılışta" tercihleri (kenar çubuğu, özet kartları) yalnızca ilgili
 * bileşen kurulurken okunur; onlar için context sadece Ayarlar'daki anahtarın
 * doğru konumda durmasını sağlar.
 */

const KEYS = {
  reduceMotion: "projelio_reduce_motion",
  showLio: "projelio_show_lio",
  showPresence: "projelio_show_presence",
  sidebarDefaultOpen: "projelio_sidebar_default_open",
  /** StatGrid'in zaten kullandığı anahtar — Ayarlar aynısını yazar. */
  statsOpen: "projelio_stats_open",
} as const;

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    // Gizli sekmede localStorage okuması hata verebilir; varsayılana düşülür.
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Yazılamazsa tercih o oturumda hatırlanmaz, özellik çalışmaya devam eder.
  }
}

/** Kenar çubuğu açılış tercihi App.tsx'te ilk state kurulurken okunur. */
export function getSidebarDefaultOpen(fallback: boolean): boolean {
  return readBool(KEYS.sidebarDefaultOpen, fallback);
}

interface AppPrefs {
  reduceMotion: boolean;
  showLio: boolean;
  showPresence: boolean;
  sidebarDefaultOpen: boolean;
  statsOpen: boolean;
  setReduceMotion: (on: boolean) => void;
  setShowLio: (on: boolean) => void;
  setShowPresence: (on: boolean) => void;
  setSidebarDefaultOpen: (on: boolean) => void;
  setStatsOpen: (on: boolean) => void;
}

const Ctx = createContext<AppPrefs | null>(null);

export function AppPrefsProvider({ children }: { children: ReactNode }) {
  const [reduceMotion, setReduceMotionState] = useState(() => readBool(KEYS.reduceMotion, false));
  const [showLio, setShowLioState] = useState(() => readBool(KEYS.showLio, true));
  const [showPresence, setShowPresenceState] = useState(() => readBool(KEYS.showPresence, true));
  const [sidebarDefaultOpen, setSidebarDefaultOpenState] = useState(() => readBool(KEYS.sidebarDefaultOpen, true));
  const [statsOpen, setStatsOpenState] = useState(() => readBool(KEYS.statsOpen, false));

  // Animasyonlar CSS'te kapatılıyor (bkz. index.css [data-reduce-motion="1"]):
  // hover/geçiş kuralları inline style ile yazılamadığı için tek yol bu.
  useEffect(() => {
    if (reduceMotion) document.documentElement.setAttribute("data-reduce-motion", "1");
    else document.documentElement.removeAttribute("data-reduce-motion");
  }, [reduceMotion]);

  const make = (setState: (v: boolean) => void, key: string) => (on: boolean) => {
    setState(on);
    writeBool(key, on);
  };

  const value: AppPrefs = {
    reduceMotion,
    showLio,
    showPresence,
    sidebarDefaultOpen,
    statsOpen,
    setReduceMotion: make(setReduceMotionState, KEYS.reduceMotion),
    setShowLio: make(setShowLioState, KEYS.showLio),
    setShowPresence: make(setShowPresenceState, KEYS.showPresence),
    setSidebarDefaultOpen: make(setSidebarDefaultOpenState, KEYS.sidebarDefaultOpen),
    setStatsOpen: make(setStatsOpenState, KEYS.statsOpen),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppPrefs(): AppPrefs {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppPrefs, AppPrefsProvider dışında çağrıldı.");
  return ctx;
}
