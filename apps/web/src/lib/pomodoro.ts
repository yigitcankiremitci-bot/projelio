import { useEffect, useSyncExternalStore } from "react";
import { bildirimSesiniDene } from "./bildirimSesi";

export const POMODORO_SURESI = { calisma: 25 * 60 * 1000, mola: 5 * 60 * 1000 } as const;
export type PomodoroEvresi = keyof typeof POMODORO_SURESI;
export type PomodoroDurumu = { evre: PomodoroEvresi; bitis: number | null; kalan: number };
export const POMODORO_BASI: PomodoroDurumu = { evre: "calisma", bitis: null, kalan: POMODORO_SURESI.calisma };

const ANAHTAR = "projelio_pano_pomodoro";
/**
 * Bu kadar eski bir geçiş için ses çalınmaz: uygulamaya saatler sonra dönen birini
 * çoktan bitmiş bir süre için uyarmak anlamsız. Bir dakikadan uzun tutuluyor,
 * çünkü tarayıcı arka plandaki sekmenin zamanlayıcısını dakikada bire düşürüyor.
 */
const SES_PENCERESI = 2 * 60 * 1000;

function depodanOku(): PomodoroDurumu {
  try {
    const ham = localStorage.getItem(ANAHTAR);
    const kayitli = (ham ? JSON.parse(ham) : {}) as Partial<PomodoroDurumu>;
    // Eski sürüm bitince { bitis: null, kalan: 0 } yazıyordu; döngüde o duruma hiç gelinmiyor.
    if (kayitli.bitis == null && !kayitli.kalan) return POMODORO_BASI;
    return { evre: kayitli.evre ?? "calisma", bitis: kayitli.bitis ?? null, kalan: kayitli.kalan ?? POMODORO_SURESI.calisma };
  } catch {
    return POMODORO_BASI;
  }
}

let durum = depodanOku();
let zamanlayici: ReturnType<typeof setTimeout> | null = null;
let izleniyor = false;
const dinleyiciler = new Set<() => void>();

function yayinla() {
  dinleyiciler.forEach((d) => d());
}

function zamanla() {
  if (zamanlayici) clearTimeout(zamanlayici);
  zamanlayici = null;
  if (!izleniyor || durum.bitis === null) return;
  zamanlayici = setTimeout(ilerlet, Math.max(0, durum.bitis - Date.now()));
}

function ilerlet() {
  // Başka sekme evreyi az önce geçirdiyse yalnızca ona uyulur; aynı bitişte iki kez ses çalmasın.
  const depodaki = depodanOku();
  if (depodaki.bitis !== durum.bitis) {
    durum = depodaki;
    yayinla();
    zamanla();
    return;
  }
  if (durum.bitis === null) return;
  const an = Date.now();
  if (durum.bitis > an) {
    zamanla();
    return;
  }
  // Uygulama kapalıyken geçen evreler de sayılır: döngü duvar saatine göre sürer.
  let { evre, bitis } = durum as { evre: PomodoroEvresi; bitis: number };
  let sonGecis = bitis;
  while (bitis <= an) {
    sonGecis = bitis;
    evre = evre === "calisma" ? "mola" : "calisma";
    bitis += POMODORO_SURESI[evre];
  }
  // bildirimSesiCal değil: o, sekme arka plandayken susuyor; süre de tam kullanıcı başka yerdeyken biter.
  if (an - sonGecis < SES_PENCERESI) bildirimSesiniDene();
  pomodoroAyarla({ evre, bitis, kalan: POMODORO_SURESI[evre] });
}

export function pomodoroAyarla(yeni: PomodoroDurumu) {
  durum = yeni;
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(yeni));
  } catch {
    // Depolama kapalıysa sayaç yine çalışır, yalnızca hatırlanmaz.
  }
  yayinla();
  zamanla();
}

function abone(dinleyici: () => void) {
  dinleyiciler.add(dinleyici);
  return () => {
    dinleyiciler.delete(dinleyici);
  };
}

export function usePomodoro(): PomodoroDurumu {
  return useSyncExternalStore(abone, () => durum);
}

/**
 * Sayacı kartın dışında yürütür: kart yalnızca anasayfada var, süre ise kullanıcı
 * başka sayfadayken de bitiyor. Oturum açıkken kabukta bir kez bağlanır, yoksa
 * giriş ekranında kimseye ait olmayan bir sayaç çalardı.
 */
export function usePomodoroIzleyici(etkin: boolean) {
  useEffect(() => {
    if (!etkin) return;
    const depoDegisti = (e: StorageEvent) => {
      if (e.key !== ANAHTAR) return;
      durum = depodanOku();
      yayinla();
      zamanla();
    };
    window.addEventListener("storage", depoDegisti);
    // Uyku ya da kısılmış zamanlayıcıdan dönüşte beklemeden yetişsin.
    document.addEventListener("visibilitychange", zamanla);
    izleniyor = true;
    durum = depodanOku();
    yayinla();
    zamanla();
    return () => {
      izleniyor = false;
      window.removeEventListener("storage", depoDegisti);
      document.removeEventListener("visibilitychange", zamanla);
      zamanla();
    };
  }, [etkin]);
}
