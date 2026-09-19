import { useSyncExternalStore } from "react";

/**
 * Lio balonunun ekrandaki hâli — boyu (küçük mü) ve kullanıcının onu ne kadar
 * yukarı taşıdığı.
 *
 * NEDEN: 132 px'lik balon sağ alt köşeye sabitti. Çalışma alanlarında
 * (özellikle görev düzenlerken) altında kalan kartın düğmesine, modalin
 * Kaydet'ine basılamıyordu. Artık çalışma alanlarında ve bir pencere açıkken
 * küçülüyor; yine de bir şeyin üstüne oturursa kullanıcı onu tutup yukarı
 * kaydırabiliyor.
 *
 * Balon (AiLauncher) ile üstüne konan iş şeridi (AiLiveActivity) App'in ayrı
 * dallarında; ikisinin de aynı ölçüye bakması gerekiyor, bu yüzden lioPanel.ts
 * ile aynı desen: modül düzeyinde küçük bir depo.
 */

const LIFT_KEY = "projelio_lio_lift";

function readLift(): number {
  try {
    const n = Number(localStorage.getItem(LIFT_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

let lift = readLift();
let compact = false;
/** Açık pencere (Modal) sayısı: iç içe açılabildiği için bayrak değil sayaç. */
let openModals = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Balonun alt kenardan fazladan ne kadar yukarıda durduğu (px).
 * `persist` yalnızca sürükleme bittiğinde: her piksel hareketinde yazmak boşa.
 */
export function setLioLift(next: number, persist = false): void {
  const value = Math.max(0, Math.round(next));
  if (value !== lift) {
    lift = value;
    emit();
  }
  if (persist) {
    try {
      if (value > 0) localStorage.setItem(LIFT_KEY, String(value));
      else localStorage.removeItem(LIFT_KEY);
    } catch {
      // Gizli sekmede yazım hata verebilir; konum o oturumda hatırlanmaz.
    }
  }
}

export function useLioLift(): number {
  return useSyncExternalStore(subscribe, () => lift, () => 0);
}

/** Balon küçük çizildiğinde bildirir (bkz. AiLauncher); şerit yerini buna göre seçer. */
export function setLioCompact(next: boolean): void {
  if (compact === next) return;
  compact = next;
  emit();
}

export function useLioCompact(): boolean {
  return useSyncExternalStore(subscribe, () => compact, () => false);
}

/**
 * Bir pencere açıldı. Dönen fonksiyon kapanışta çağrılır (useEffect temizleyicisi).
 * Pencere açıkken Lio küçülür: görev düzenleme modalinin alt köşesindeki
 * Kaydet çubuğu tam balonun altına denk geliyordu.
 */
export function lioModalAcildi(): () => void {
  openModals += 1;
  emit();
  let kapandi = false;
  return () => {
    if (kapandi) return;
    kapandi = true;
    openModals = Math.max(0, openModals - 1);
    emit();
  };
}

export function useLioModalAcik(): boolean {
  return useSyncExternalStore(subscribe, () => openModals > 0, () => false);
}
