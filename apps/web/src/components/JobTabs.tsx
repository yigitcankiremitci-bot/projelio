import TabBar from "./TabBar";

export type JobTab = "projects" | "programs" | "team" | "tasks" | "files" | "modules";

// Projeler süreli ve biten işleri, Rutinler (kodda "program"/"operation") süresiz
// ve tekrarlayan işleri tutar. İkisi de bu işin altında yaşadığı için sekmeler
// yan yana durur.
const tabs: { key: JobTab; label: string }[] = [
  { key: "projects", label: "Projeler" },
  { key: "programs", label: "Rutinler" },
  { key: "team", label: "Ekip" },
  { key: "tasks", label: "İşler" },
  // Dosyalar işe aittir: iş sahibi altındaki tüm projelerin dosyalarını burada görür.
  { key: "files", label: "Dosyalar" },
  // Modüller de işe aittir: anasayfadan bu işe atanan modüller burada açılır.
  { key: "modules", label: "Modüller" },
];

interface Props {
  active: JobTab;
  onChange: (tab: JobTab) => void;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. JobDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
}

export default function JobTabs({ active, onChange, style }: Props) {
  return <TabBar tabs={tabs} active={active} onChange={(k) => onChange(k as JobTab)} style={style} />;
}
