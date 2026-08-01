import { useEffect, useState } from "react";

// Masaüstü genişliği eşiği: bunun altında (telefon/dar tablet) alt menü + FAB,
// üstünde (masaüstü/geniş ekran) sol sidebar kullanılır.
const DESKTOP_QUERY = "(min-width: 880px)";

/**
 * Uygulama genelinde tek bir yerden "masaüstü mü?" kararını veren hook.
 * Pencere yeniden boyutlandırıldığında (örn. tarayıcı penceresi küçültülüp
 * büyütüldüğünde) canlı olarak güncellenir.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isDesktop;
}
