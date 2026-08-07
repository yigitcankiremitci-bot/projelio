// Sidebar'daki (ve mobilde alt bardaki) "Ana Sayfa" düğmesinin nereye gideceği
// kullanıcı tarafından değiştirilebilir: her açılışta kendi şirketine ya da sürekli
// çalıştığı işe düşmek isteyen kullanıcılar için. Tercih, yazı boyutu ayarıyla aynı
// mantıkla cihazda (localStorage) tutulur — hesaba bağlı değildir, dolayısıyla
// backend'de bir alan veya migration gerektirmez.
//
// Sadece "path" değil "label" de saklanır: menüde seçilen yerin adını, o kaydın
// listesini yeniden çekmeden gösterebilmek için. Hedefteki kayıt sonradan silinirse
// bağlantı boş bir sayfaya gider; kullanıcı ayarı buradan tekrar değiştirebilir.

import { useEffect, useState } from "react";

export const HOME_TARGET_STORAGE_KEY = "projelio_home_target";

export interface HomeTarget {
  /** react-router yolu, örn. "/organizations/abc" ya da "/?tab=budget". */
  path: string;
  /** Menüde ve ayarlar ekranında gösterilen ad. */
  label: string;
}

export const DEFAULT_HOME_TARGET: HomeTarget = { path: "/", label: "Ana Sayfa" };

// Aynı sekmedeki diğer bileşenler (Sidebar, Ayarlar) anında haberdar olsun diye
// küçük bir abonelik listesi; farklı sekmeler için window "storage" olayı kullanılır.
const listeners = new Set<(target: HomeTarget) => void>();

export function getHomeTarget(): HomeTarget {
  try {
    const raw = localStorage.getItem(HOME_TARGET_STORAGE_KEY);
    if (!raw) return DEFAULT_HOME_TARGET;
    const parsed = JSON.parse(raw) as Partial<HomeTarget>;
    if (typeof parsed?.path === "string" && typeof parsed?.label === "string" && parsed.path.startsWith("/")) {
      return { path: parsed.path, label: parsed.label };
    }
  } catch {
    // Bozuk/eski bir değer varsa varsayılana dön.
  }
  return DEFAULT_HOME_TARGET;
}

/** null verilirse ayar sıfırlanır (Ana Sayfa'ya döner). */
export function setHomeTarget(target: HomeTarget | null) {
  if (target && target.path !== DEFAULT_HOME_TARGET.path) {
    localStorage.setItem(HOME_TARGET_STORAGE_KEY, JSON.stringify(target));
  } else {
    localStorage.removeItem(HOME_TARGET_STORAGE_KEY);
  }
  const next = getHomeTarget();
  listeners.forEach((fn) => fn(next));
}

/** Geçerli hedefi döner ve başka bir yerden değiştirildiğinde yeniden render eder. */
export function useHomeTarget(): HomeTarget {
  const [target, setTarget] = useState<HomeTarget>(getHomeTarget);

  useEffect(() => {
    const onExternalChange = () => setTarget(getHomeTarget());
    listeners.add(setTarget);
    window.addEventListener("storage", onExternalChange);
    return () => {
      listeners.delete(setTarget);
      window.removeEventListener("storage", onExternalChange);
    };
  }, []);

  return target;
}
