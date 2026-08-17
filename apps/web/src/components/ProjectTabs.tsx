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
}

// Görünüm ve taşma kuralı TabBar'da (bkz. components/TabBar.tsx): sekmeler
// sığdığı kadar yan yana dizilir, sığmayan alt satıra iner.
export default function ProjectTabs({ active, onChange, style }: Props) {
  return <TabBar tabs={tabs} active={active} onChange={(k) => onChange(k as ProjectTab)} style={style} />;
}
