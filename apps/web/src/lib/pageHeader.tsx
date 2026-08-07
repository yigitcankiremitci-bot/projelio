import { createContext, useContext, useEffect } from "react";
import type { DependencyList, ReactNode, RefObject } from "react";
import { useState } from "react";

export interface PageHeaderRegistration {
  /** Kaydırınca tepede sabitlenecek başlık (şirket/iş/proje adı). */
  title: string;
  /**
   * Sayfanın kapak bloğu. Sabit başlık, kapağın alt kenarı üst şeridin altına
   * geçtiği anda belirir. Kapak yükseklikleri sayfadan sayfaya değiştiği
   * (270–330 px, projede kapak yoksa değişken) için sabit bir eşik yerine
   * elemanın kendisi ölçülüyor.
   */
  coverRef: RefObject<HTMLElement>;
}

interface PageHeaderContextValue {
  registration: PageHeaderRegistration | null;
  setRegistration: (value: PageHeaderRegistration | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  registration: null,
  setRegistration: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<PageHeaderRegistration | null>(null);
  return (
    <PageHeaderContext.Provider value={{ registration, setRegistration }}>{children}</PageHeaderContext.Provider>
  );
}

export function usePageHeaderState() {
  return useContext(PageHeaderContext).registration;
}

/**
 * Kapak fotoğrafı olan detay sayfaları (iş/proje/program/organizasyon/departman/
 * grup) başlıklarını buradan bildirir. Kapak, sayfanın en üstüne kadar uzandığı
 * için o sayfalarda üstte opak bir şerit yok; aşağı kaydırıldığında içerik sabit
 * duran logonun ve bildirim çanının altından geçip okunmaz hale geliyordu.
 * App bu kayda bakarak kaydırma sırasında opak bir üst şerit + başlık satırı
 * gösterir (bkz. App.tsx).
 */
export function usePageHeader(title: string | undefined, coverRef: RefObject<HTMLElement>, deps: DependencyList) {
  const { setRegistration } = useContext(PageHeaderContext);
  useEffect(() => {
    setRegistration(title ? { title, coverRef } : null);
    return () => setRegistration(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
