import { createContext, useContext, useEffect, useMemo } from "react";
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
  /**
   * Sabit başlık satırında gösterilecek isteğe bağlı ek kontroller (bkz.
   * OutputsPanel: Görevler/Çıktılar başlığın hemen yanında solda, Sırala/Seç
   * kişi kartının yanında sağda). Sayfanın kendi içeriğinde ayrıca da
   * gösterilebilirler; ikisi aynı state'i paylaştığı için birbirleriyle
   * tutarlı kalırlar.
   */
  actions?: PageHeaderActions;
  /**
   * Sayfanın kendi sekme çubuğu (bkz. ProjectDetail: Sosyal/Ekip/Görev-Çıktı/
   * Dosyalar/Bütçe/Süreç). Verilirse, kaydırınca beliren sabit şeridin EN
   * ÜSTÜNDEKİ — normalde yalnızca logo/bildirim çanına zemin olan boş bant —
   * bu sekme çubuğunu gösterir; aksi halde o bant kaydırma sonrası boş/beyaz
   * kalıyordu. `actions`tan ayrı tutulur: `actions`ı sekmeye göre değişen bir
   * alt bileşen (ör. OutputsPanel) kaydedebiliyor, sekme çubuğunu ise sayfanın
   * kendisi (üst bileşen) — ikisi aynı state'i paylaşırsa biri diğerini silerdi.
   */
  tabs?: PageHeaderTabs;
}

export interface PageHeaderTabs {
  node: ReactNode;
  /**
   * Sayfanın kendi (akıştaki) sekme çubuğunun DOM öğesi.
   *
   * Verilirse sabit şeritteki kopya, ancak BU çubuk yukarı kayıp şeridin altına
   * geçtikten sonra belirir. Verilmezse eşik kapağa göre hesaplanır ve sayfanın
   * kendi sekmeleri hâlâ ekrandayken kopyası da belirir — her düğme iki kez
   * görünür. Aynı sorun araç çubuğunda yaşanmıştı (bkz. PageHeaderActions.sourceRef).
   */
  sourceRef?: RefObject<HTMLElement>;
}

export interface PageHeaderActions {
  left?: ReactNode;
  right?: ReactNode;
  /**
   * Sayfadaki gerçek araç çubuğunun (bkz. OutputsPanel `toolbar`) DOM öğesi.
   * Verilirse sabit başlık, kapağın değil BU satırın altı üst şeridin altına
   * geçtiğinde belirir (bkz. App.tsx CoverStickyHeader) — aksi halde araç
   * çubuğu hâlâ ekrandayken sabit başlıktaki küçültülmüş kopyası da belirip
   * aynı Sırala/Seç düğmeleri bir an için iki kez görünüyordu.
   */
  sourceRef?: RefObject<HTMLElement>;
}

interface PageHeaderContextValue {
  registration: PageHeaderRegistration | null;
  setRegistration: (value: PageHeaderRegistration | null) => void;
  actions: PageHeaderActions | null;
  setActions: (value: PageHeaderActions | null) => void;
  tabs: PageHeaderTabs | null;
  setTabs: (value: PageHeaderTabs | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  registration: null,
  setRegistration: () => {},
  actions: null,
  setActions: () => {},
  tabs: null,
  setTabs: () => {},
});

export function PageHeaderProvider({ children }: { children: ReactNode }) {
  const [registration, setRegistration] = useState<PageHeaderRegistration | null>(null);
  const [actions, setActions] = useState<PageHeaderActions | null>(null);
  const [tabs, setTabs] = useState<PageHeaderTabs | null>(null);
  const value = useMemo(
    () => ({ registration, setRegistration, actions, setActions, tabs, setTabs }),
    [registration, actions, tabs]
  );
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
}

export function usePageHeaderState() {
  const { registration, actions, tabs } = useContext(PageHeaderContext);
  return registration ? { ...registration, actions, tabs } : null;
}

/**
 * Kapak fotoğrafı olan detay sayfaları (iş/proje/rutin/organizasyon/departman/
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

/**
 * Sabit başlık satırında gösterilecek ek kontrolleri kaydeder (bkz.
 * OutputsPanel: `left` başlığın yanında, `right` kişi kartının yanında
 * gösterilir). Kaydeden bileşen unmount olduğunda (ör. sekme değişip
 * görevler/çıktılar paneli kalktığında) otomatik temizlenir, böylece başka
 * bir sekmedeyken sabit başlıkta eski kontroller asılı kalmaz.
 */
export function usePageHeaderActions(actions: PageHeaderActions | null, deps: DependencyList) {
  const { setActions } = useContext(PageHeaderContext);
  useEffect(() => {
    setActions(actions);
    return () => setActions(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Sabit başlığın en üstteki (normalde boş) bandında gösterilecek sekme
 * çubuğunu kaydeder (bkz. ProjectDetail). Sayfanın kendisi kaydeder — bir alt
 * sekmenin (ör. OutputsPanel) `usePageHeaderActions` ile kaydettiği `left`/
 * `right` ile aynı state'i PAYLAŞMAZ, bu yüzden biri diğerini silmez.
 */
export function usePageHeaderTabs(
  tabs: ReactNode | null,
  deps: DependencyList,
  sourceRef?: RefObject<HTMLElement>
) {
  const { setTabs } = useContext(PageHeaderContext);
  useEffect(() => {
    setTabs(tabs ? { node: tabs, sourceRef } : null);
    return () => setTabs(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
