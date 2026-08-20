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

/**
 * "Kapağın içine bir şey daha sığar mı?" eşiği.
 *
 * `useIsDesktop` (880px) alt menü mü sidebar mı sorusunu cevaplıyor; kapağın
 * yatayda kaç blok taşıyabileceği ayrı bir soru. Sidebar açıkken 328px gidiyor,
 * yani 880px'lik bir pencerede kapağa kalan 496px: başlık bloğunun yanına özet
 * şeridi konursa başlık 140px'e sıkışıyor. 1180px'in altında özet akışta kalır.
 */
const WIDE_QUERY = "(min-width: 1180px)";

export function useIsWide(): boolean {
  const [isWide, setIsWide] = useState(
    () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = () => setIsWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isWide;
}
