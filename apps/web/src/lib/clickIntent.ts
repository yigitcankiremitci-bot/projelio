import { useEffect, useRef } from "react";

/**
 * Tek tıklamanın, çift tıklamanın İLK tıklaması sayılmadan önce beklediği süre (ms).
 *
 * Tarayıcı çift tıklamada önce iki ayrı `click`, sonra `dblclick` gönderir. Tek
 * tıklama işini doğrudan `click` içinde yapan bir kart, kullanıcı çift tıkladığında
 * o işi iki kez yapıp ardından çift tıklama işini de yapıyor — "tek tık mı çift tık
 * mı" ayrımı kullanıcı açısından kayboluyor.
 *
 * Değer işletim sisteminin çift tıklama eşiğinden (macOS'ta varsayılan ~500ms'e
 * kadar ayarlanabilir) kısa, ama tek tıklamayı gözle görülür şekilde geciktirmeyecek
 * kadar uzun seçildi. Kısaltmak "çift tıklayamıyorum" şikayetini geri getirir.
 */
export const DOUBLE_CLICK_GRACE = 300;

export interface ClickIntent {
  /** Çift tıklama gelmezse çalışacak tek tıklama işi. */
  single: (run: () => void) => void;
  /** Bekleyen tek tıklama işini iptal edip çift tıklama işini çalıştırır. */
  double: (run: () => void) => void;
}

/**
 * Aynı öğede hem tek hem çift tıklamanın işi olduğunda ikisini birbirinden ayırır.
 *
 * Kullanımı:
 *   const click = useClickIntent();
 *   onClick={() => click.single(() => setAcik(!acik))}
 *   onDoubleClick={(e) => { e.stopPropagation(); click.double(() => ac(kayit)); }}
 *
 * Çift tıklama işi OLMAYAN öğelerde kullanma — tek tıklamayı boşuna geciktirir.
 */
export function useClickIntent(): ClickIntent {
  const timer = useRef<number | null>(null);

  // Bileşen sökülürken bekleyen iş çalışmasın (kapalı bir kartın state'ine yazardı).
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  return {
    single(run) {
      // Zamanlayıcı zaten kuruluysa bu, çift tıklamanın ikinci tıklamasıdır:
      // kararı `dblclick` verecek, burada hiçbir şey yapılmaz.
      if (timer.current !== null) return;
      timer.current = window.setTimeout(() => {
        timer.current = null;
        run();
      }, DOUBLE_CLICK_GRACE);
    },
    double(run) {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      run();
    },
  };
}
