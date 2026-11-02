import { useEffect, useState } from "react";

/**
 * Pencerelerin (portal) taşınacağı öğe. Tarayıcı tam ekranında yalnızca tam
 * ekrana alınan öğe ve içi çizilir: body'ye taşınan modal 3D ofis tam
 * ekrandayken hiç görünmüyordu (2026-11-02). O sırada tam ekran öğesinin
 * içine taşınır; tam ekran açılıp kapanınca yeniden çizilir.
 */
export function usePortalHedefi(): HTMLElement {
  const [hedef, setHedef] = useState<HTMLElement>(() => (document.fullscreenElement as HTMLElement | null) ?? document.body);
  useEffect(() => {
    const degisti = () => setHedef((document.fullscreenElement as HTMLElement | null) ?? document.body);
    document.addEventListener("fullscreenchange", degisti);
    return () => document.removeEventListener("fullscreenchange", degisti);
  }, []);
  return hedef;
}
