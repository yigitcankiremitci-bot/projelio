import { createContext, useContext, useEffect } from "react";
import type { DependencyList } from "react";

export interface ProjectFabActionOption {
  label: string;
  onClick: () => void;
}

export interface ProjectFabAction {
  label: string;
  // Tek bir eylem için onClick yeterli. Birden fazla ekleme seçeneği sunmak
  // gerektiğinde (örn. şirket anasayfasında "+" ile departman/ürün-hizmet/modül
  // arasından seçim) onClick yerine options verilir — BottomNav bu durumda
  // doğrudan tetiklemek yerine küçük bir seçim menüsü açar (bkz. job-choice deseni).
  onClick?: () => void;
  options?: ProjectFabActionOption[];
}

interface ProjectFabContextValue {
  action: ProjectFabAction | null;
  setAction: (action: ProjectFabAction | null) => void;
}

// Proje detay sayfasındaki her sekme (Çıktılar/Sosyal/Ekip/Bütçe/Süreç), alt navigasyondaki
// "+" butonunun o an ne yapacağını bu context üzerinden bildirir. BottomNav rota bazlı
// varsayılan davranış yerine burada kayıtlı olan eylemi kullanır.
export const ProjectFabContext = createContext<ProjectFabContextValue>({
  action: null,
  setAction: () => {},
});

export function useProjectFabAction(action: ProjectFabAction | null, deps: DependencyList) {
  const { setAction } = useContext(ProjectFabContext);
  useEffect(() => {
    setAction(action);
    return () => setAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
