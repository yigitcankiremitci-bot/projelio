import TabBar from "./TabBar";

export type ProjectTab = "feed" | "team" | "tasks" | "files" | "budget" | "process";

export const PROJECT_TABS: { key: ProjectTab; label: string }[] = [
  { key: "feed", label: "Sosyal" }, // dil:anahtar
  { key: "team", label: "Ekip" }, // dil:anahtar
  // Sekme hem düz görev listesini hem çıktı katmanını barındırıyor; yalnızca
  // "Çıktılar" yazdığında insanlar sekmenin ne işe yaradığını anlamıyordu.
  { key: "tasks", label: "Görev/Çıktı" }, // dil:anahtar
  { key: "files", label: "Dosyalar" }, // dil:anahtar
  { key: "budget", label: "Bütçe" }, // dil:anahtar
  { key: "process", label: "Süreç" }, // dil:anahtar
];

interface Props {
  active: ProjectTab;
  onChange: (tab: ProjectTab) => void;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. ProjectDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır — o bantta
  // altında başka içerik olmadığından boşluk gereksiz.
  style?: React.CSSProperties;
  /** Tek satır + yana kaydırma (bkz. TabBar): sabit şeritteki kopya kullanır. */
  scrollable?: boolean;
  /**
   * false ise "Bütçe" sekmesi hiç render edilmez. Proje bütçesini yalnızca
   * proje/iş sahibi ve "bütçeyi görebilir" izni açık üyeler okuyabilir
   * (bkz. BudgetService.assertCanViewBudget); taşerona bu izin kapalıdır.
   */
  showBudget?: boolean;
  /**
   * Taşeron hesabı ise "Ekip" sekmesi de gizlenir: taşeron projede kimin
   * çalıştığını, ücretlerini ve e-postalarını görmemeli.
   */
  isSubcontractor?: boolean;
  /** Sahibinin ayarlardan kapattığı sekmeler (Project.hiddenTabs). */
  hiddenTabs?: string[];
}

// Görünüm ve taşma kuralı TabBar'da (bkz. components/TabBar.tsx): sekmeler
// sığdığı kadar yan yana dizilir, sığmayan alt satıra iner.
export function visibleProjectTabs(showBudget: boolean, isSubcontractor: boolean, hiddenTabs?: string[]) {
  // Sahibinin ayarlardan kapattıkları (bkz. Project.hiddenTabs) yetki
  // kontrolünden ÖNCE düşer; kapatma bir sadeleştirmedir, yetki açamaz.
  const hidden = new Set(hiddenTabs ?? []);
  return PROJECT_TABS.filter((t) => {
    if (hidden.has(t.key)) return false;
    if (t.key === "budget") return showBudget;
    if (t.key === "team") return !isSubcontractor;
    return true;
  });
}

export default function ProjectTabs({
  active,
  onChange,
  style,
  scrollable,
  showBudget = true,
  isSubcontractor = false,
  hiddenTabs,
}: Props) {
  return (
    <TabBar
      tabs={visibleProjectTabs(showBudget, isSubcontractor, hiddenTabs)}
      active={active}
      onChange={(k) => onChange(k as ProjectTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
