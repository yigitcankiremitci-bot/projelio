import TabBar from "./TabBar";

export type JobTab = "projects" | "programs" | "team" | "tasks" | "files" | "modules";

// Projeler süreli ve biten işleri, Rutinler (kodda "program"/"operation") süresiz
// ve tekrarlayan işleri tutar. İkisi de bu işin altında yaşadığı için sekmeler
// yan yana durur.
const tabs: { key: JobTab; label: string }[] = [
  { key: "projects", label: "Projeler" }, // dil:anahtar
  { key: "programs", label: "Rutinler" }, // dil:anahtar
  { key: "team", label: "Ekip" }, // dil:anahtar
  { key: "tasks", label: "İşler" }, // dil:anahtar
  // Dosyalar işe aittir: iş sahibi altındaki tüm projelerin dosyalarını burada görür.
  { key: "files", label: "Dosyalar" }, // dil:anahtar
  // Modüller de işe aittir: anasayfadan bu işe atanan modüller burada açılır.
  { key: "modules", label: "Modüller" }, // dil:anahtar
];

/**
 * Taşerona kapalı iş sekmeleri: Ekip (kim çalışıyor) ve Modüller (işin
 * kurumsal araçları). Taşeron işi görür — orada çalışıyor — ama işin ekibini
 * ve modüllerini görmez. Sunucu da bu uçları reddeder
 * (bkz. backend job-members / job-modules controller).
 */
const SUBCONTRACTOR_HIDDEN: JobTab[] = ["team", "modules"];

export function visibleJobTabs(isSubcontractor: boolean): { key: JobTab; label: string }[] {
  if (!isSubcontractor) return tabs;
  return tabs.filter((t) => !SUBCONTRACTOR_HIDDEN.includes(t.key));
}

interface Props {
  active: JobTab;
  onChange: (tab: JobTab) => void;
  /** Taşeron hesabı ise Ekip ve Modüller sekmeleri hiç render edilmez. */
  isSubcontractor?: boolean;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. JobDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
  /** Tek satır + yana kaydırma (bkz. TabBar): sabit şeritteki kopya kullanır. */
  scrollable?: boolean;
}

export default function JobTabs({ active, onChange, style, scrollable, isSubcontractor = false }: Props) {
  return (
    <TabBar
      tabs={visibleJobTabs(isSubcontractor)}
      active={active}
      onChange={(k) => onChange(k as JobTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
