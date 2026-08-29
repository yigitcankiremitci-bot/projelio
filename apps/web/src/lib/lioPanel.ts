import { useSyncExternalStore } from "react";

/**
 * "Lio sohbet paneli şu an açık mı?" — uygulamanın geri kalanı için.
 *
 * Panel AiLauncher'ın içinde, sayfa ağacının tamamen dışında yaşıyor; onun
 * durumuna ihtiyacı olan tek bileşen (Lio'nun iş bildirimi şeridi, bkz.
 * AiLiveActivity) ise App'in başka bir dalında duruyor. Şerit panelin altında
 * kalmasın diye yerini panele göre seçmek zorunda: panel açıkken balon
 * gizleniyor, yani "balonun üstü" diye bir yer kalmıyor.
 *
 * Tek bir boolean için tüm uygulamayı saran bir provider yerine askLio'daki
 * yaklaşımın aynısı: modül düzeyinde küçük bir depo.
 */
let panelOpen = false;
const listeners = new Set<() => void>();

/** Paneli açan/kapatan taraf (AiLauncher) bildirir. */
export function setLioPanelOpen(open: boolean): void {
  if (panelOpen === open) return;
  panelOpen = open;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useLioPanelOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => panelOpen,
    () => false
  );
}
