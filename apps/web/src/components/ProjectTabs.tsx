import TabBar from "./TabBar";

export type ProjectTab = "feed" | "team" | "tasks" | "files" | "budget" | "process";

const tabs: { key: ProjectTab; label: string }[] = [
  { key: "feed", label: "Sosyal" },
  { key: "team", label: "Ekip" },
  // Sekme hem düz görev listesini hem çıktı katmanını barındırıyor; yalnızca
  // "Çıktılar" yazdığında insanlar sekmenin ne işe yaradığını anlamıyordu.
  { key: "tasks", label: "Görev/Çıktı" },
  { key: "files", label: "Dosyalar" },
  { key: "budget", label: "Bütçe" },
  { key: "process", label: "Süreç" },
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
}

// Görünüm ve taşma kuralı TabBar'da (bkz. components/TabBar.tsx): sekmeler
// sığdığı kadar yan yana dizilir, sığmayan alt satıra iner.
export function visibleProjectTabs(showBudget: boolean, isSubcontractor: boolean) {
  return tabs.filter((t) => {
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
}: Props) {
  return (
    <TabBar
      tabs={visibleProjectTabs(showBudget, isSubcontractor)}
      active={active}
      onChange={(k) => onChange(k as ProjectTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
