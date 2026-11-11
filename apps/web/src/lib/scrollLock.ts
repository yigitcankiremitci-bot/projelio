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

export function createScrollLock(
  getTarget: () => ScrollLockTarget | null,
  /** İlk kilit alınınca / son kilit bırakılınca (bkz. kaydirmaCubuguTelafisi). */
  kancalar: { kilitlendi?: () => void; birakildi?: () => void } = {}
) {
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
        kancalar.kilitlendi?.();
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
        kancalar.birakildi?.();
      };
    },

    /** Yalnızca test için: kaç kilit açık. */
    get depth(): number {
      return depth;
    },
  };
}

/**
 * Kaydırma çubuğu kaybolunca sayfa yana kaymasın.
 *
 * Yer kaplayan kaydırma çubuklu tarayıcıda (Windows, "çubukları hep göster"li
 * Mac) kilit çubuğu kaldırıyor, sayfa 15 px genişleyip her şey yarım çubuk
 * sağa kayıyordu — her pencere açılışında (kullanıcı geri bildirimi,
 * 2026-11-11). Asıl önlem index.css'teki `scrollbar-gutter: stable`: çubuğun
 * yeri hep ayrılı kalır, sabit (fixed) üst çubuk da kıpırdamaz.
 *
 * Onu tanımayan tarayıcıda yedek: çubuğun genişliği kilitten ÖNCE ölçülür ve
 * gövdeye o kadar sağ boşluk verilir. Kilitten SONRA ölçmek işe yaramıyor:
 * Chromium çubuğu bir sonraki karede kaldırıyor, o an fark hep 0 görünüyor.
 */
function kaydirmaCubuguTelafisi() {
  let cubuk = 0;
  let sonCubuk = 0;
  let oncekiBosluk: string | null = null;
  const yerAyrili = () => typeof CSS !== "undefined" && CSS.supports?.("scrollbar-gutter", "stable");
  return {
    olc() {
      if (yerAyrili()) return void (cubuk = 0);
      // Kilit az önce bırakıldıysa çubuk henüz geri çizilmemiş, ölçüm 0 çıkar
      // (geliştirmede StrictMode etkiyi iki kez çalıştırıyor): sayfa kayacak
      // kadar uzunsa son ölçülen genişlik kullanılır.
      const olculen = window.innerWidth - document.documentElement.clientWidth;
      if (olculen > 0) sonCubuk = olculen;
      const tasiyor = document.documentElement.scrollHeight > window.innerHeight;
      cubuk = tasiyor ? olculen || sonCubuk : 0;
    },
    kilitlendi() {
      if (cubuk <= 0) return;
      oncekiBosluk = document.body.style.paddingRight;
      const mevcut = parseFloat(getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${mevcut + cubuk}px`;
    },
    birakildi() {
      if (oncekiBosluk === null) return;
      document.body.style.paddingRight = oncekiBosluk;
      oncekiBosluk = null;
    },
  };
}

const telafi = kaydirmaCubuguTelafisi();
const govdeKilidi = createScrollLock(() => (typeof document === "undefined" ? null : document.body), {
  kilitlendi: () => telafi.kilitlendi(),
  birakildi: () => telafi.birakildi(),
});

/** Uygulamanın tek kilidi — bütün modallar bunu paylaşıyor. */
export const bodyScrollLock = {
  acquire(): () => void {
    // Çubuk kilitten ÖNCE ölçülür (bkz. kaydirmaCubuguTelafisi).
    if (govdeKilidi.depth === 0 && typeof document !== "undefined") telafi.olc();
    return govdeKilidi.acquire();
  },
  get depth(): number {
    return govdeKilidi.depth;
  },
};
