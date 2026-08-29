/**
 * Sayfa kaydırmasının SAYAÇLI kilidi.
 *
 * AYIKLANAN HATA. Modal, arkadaki sayfayı kilitlerken `body.style.overflow`un
 * eski değerini saklayıp kapanırken geri koyuyordu. İki modal iç içeyken bu
 * bozuluyor:
 *
 *   1. Görev düzenleme modalı açılır  -> eski değer "",       overflow = hidden
 *   2. İçindeki silme onayı açılır    -> eski değer "hidden", overflow = hidden
 *   3. Silme onaylanır ve İKİSİ BİRDEN kapanır. React kaldırma temizliğini
 *      üstten alta çalıştırdığı için önce dış modal ""yi geri koyar, hemen
 *      ardından iç modal "hidden"ı geri koyar.
 *
 * Sonuç: sayfa, kullanıcı yenileyene kadar kaydırılamaz halde kalır — alt görev
 * silindikten sonra tam olarak bu yaşandı. Hata modalların kapanma SIRASINA
 * bağlı olduğu için de her zaman görünmüyor.
 *
 * ÇÖZÜM: kaç kilit olduğunu say. İlk kilit alınırken gerçek değer saklanır,
 * SON kilit bırakılırken geri konur. Aradaki hiçbir bırakma sayfaya dokunmaz,
 * dolayısıyla sıra da önemli değil.
 */

export interface ScrollLockTarget {
  style: { overflow: string };
}

export function createScrollLock(getTarget: () => ScrollLockTarget | null) {
  let depth = 0;
  let previousOverflow = "";

  return {
    /** Kilidi alır; dönen fonksiyon bırakır. `useEffect`ten doğrudan döndürülebilir. */
    acquire(): () => void {
      const target = getTarget();
      if (!target) return () => {};

      if (depth === 0) {
        previousOverflow = target.style.overflow;
        target.style.overflow = "hidden";
      }
      depth += 1;

      // Aynı kilidin iki kez bırakılması sayacı eksiye düşürüp sayfayı kilitli
      // bırakabilirdi; React StrictMode geliştirmede etkileri iki kez çalıştırıyor.
      let released = false;
      return () => {
        if (released) return;
        released = true;
        depth -= 1;
        if (depth > 0) return;
        const current = getTarget();
        if (current) current.style.overflow = previousOverflow;
      };
    },

    /** Yalnızca test için: kaç kilit açık. */
    get depth(): number {
      return depth;
    },
  };
}

/** Uygulamanın tek kilidi — bütün modallar bunu paylaşıyor. */
export const bodyScrollLock = createScrollLock(() =>
  typeof document === "undefined" ? null : document.body
);
