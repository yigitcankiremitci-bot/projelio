import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DependencyList, ReactNode } from "react";
import { FAB_PRIORITY, mergeFabActions, type FabRegistration, type ProjectFabAction } from "./fabMerge";

// Tipler ve birleştirme mantığı ayrı dosyada (JSX'siz koşulabilsin diye,
// bkz. fabMerge.ts); buradan yeniden dışa aktarılıyor ki çağıranlar tek bir
// modülü ("../lib/projectFab") import etmeye devam etsin.
export { FAB_PRIORITY } from "./fabMerge";
export type { ProjectFabAction, ProjectFabActionOption } from "./fabMerge";

interface RegistryValue {
  register: (id: number, priority: number, action: ProjectFabAction | null) => void;
  unregister: (id: number) => void;
}

const RegistryContext = createContext<RegistryValue>({ register: () => {}, unregister: () => {} });
const ResolvedContext = createContext<ProjectFabAction | null>(null);

/**
 * Modalin içinde "+" ulaşılamaz: yuvarlak buton karartmanın ALTINDA kalıyor.
 * Modal (bkz. components/Modal.tsx) çocuklarını bu bayrakla sarar; içeride
 * kalan paneller kayıt yapmaz ve kendi satır içi ekleme düğmelerini gösterir.
 */
const SuppressContext = createContext(false);

/**
 * "+" düğmesinin o an ne yapacağını tutan kayıt defteri.
 *
 * Eskiden bu tek bir slottu (`setAction`) ve iki bileşen aynı anda kayıt
 * yapamıyordu: efektler çocuktan ebeveyne çalıştığı için ÜSTTEKİ bileşenin
 * efekti, çocuğun az önce yazdığı eylemi null ile eziyordu. Kaçınmak için
 * sayfalara `useFab={false}` gibi bayraklar ve "FabRegistrar" sarmalayıcıları
 * eklenmişti. Defter id'li olunca sorun kökten kalkıyor: herkes kendi kaydını
 * yazar, kendi kaydını siler; kimin kazandığına öncelik karar verir.
 */
export function ProjectFabProvider({ children }: { children: ReactNode }) {
  const entries = useRef(new Map<number, FabRegistration>());
  const [resolved, setResolved] = useState<ProjectFabAction | null>(null);

  const recompute = useCallback(() => {
    setResolved(mergeFabActions([...entries.current.values()]));
  }, []);

  const register = useCallback(
    (id: number, priority: number, action: ProjectFabAction | null) => {
      if (action) entries.current.set(id, { id, priority, action });
      else entries.current.delete(id);
      recompute();
    },
    [recompute]
  );

  const unregister = useCallback(
    (id: number) => {
      entries.current.delete(id);
      recompute();
    },
    [recompute]
  );

  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);

  return (
    <RegistryContext.Provider value={registry}>
      <ResolvedContext.Provider value={resolved}>{children}</ResolvedContext.Provider>
    </RegistryContext.Provider>
  );
}

/** BottomNav'ın okuduğu, birleştirilmiş eylem. */
export function useProjectFab(): ProjectFabAction | null {
  return useContext(ResolvedContext);
}

/**
 * "+" bu bileşenin bulunduğu yerden ulaşılabilir mi.
 *
 * Modal içinde false döner. Panel, ekleme düğmesini yalnızca bu false iken
 * çizmeli: dışarıda düğme "+"ın kopyası olur, içeride ise tek ekleme yolu odur.
 */
export function useFabAvailable(): boolean {
  return !useContext(SuppressContext);
}

/** Modalin içindeki panellerin "+"a kayıt yapmasını engeller. */
export function FabSuppressed({ children }: { children: ReactNode }) {
  return <SuppressContext.Provider value={true}>{children}</SuppressContext.Provider>;
}

let nextFabId = 1;

/**
 * Bu bileşen ekrandayken "+" düğmesinin ne yapacağını bildirir.
 *
 * `action` null verilirse kayıt silinir (yetkisi olmayan kullanıcıda "+"
 * tamamen gizlensin diye). Öncelik için bkz. FAB_PRIORITY.
 */
export function useProjectFabAction(
  action: ProjectFabAction | null,
  deps: DependencyList,
  priority: number = FAB_PRIORITY.page
) {
  const { register, unregister } = useContext(RegistryContext);
  const suppressed = useContext(SuppressContext);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextFabId++;
  const id = idRef.current;

  useEffect(() => {
    if (suppressed) return;
    register(id, priority, action);
    return () => unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, suppressed, priority]);
}
