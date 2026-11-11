import { createContext, useContext, useEffect, type ReactNode } from "react";

/**
 * Modül sayfasının geri hapı, modülün KENDİ sekmelerinin altında.
 *
 * Modül sayfasında başlık üst şeride (logo ile yardım düğmesinin arasına)
 * taşındı; geri hapı ise sekmeli modüllerde sekmelerin altında duruyor
 * (kullanıcı isteği, 2026-11-11). Sekmelerin nerede olduğunu yalnızca modül
 * bilir: ModulePage hapı bu bağlamla verir, sekmeli bir modül useModulGeriHapi
 * ile alıp kendi yerine koyar. Alan olmazsa (sekmesiz modüller) hap
 * ModulePage'de, modülün üstünde kalır.
 */
export interface ModulGeriBaglami {
  hap: ReactNode;
  /** Hap modül tarafından yerleştirildi; dönen fonksiyon geri bırakır. */
  ustlen: () => () => void;
}

export const ModulGeriContext = createContext<ModulGeriBaglami | null>(null);

/** Modül sayfasında açıldıysa geri hapı; başka yerde (pencere, kart) null. */
export function useModulGeriHapi(): ReactNode | null {
  const b = useContext(ModulGeriContext);
  useEffect(() => b?.ustlen(), [b]);
  return b?.hap ?? null;
}
