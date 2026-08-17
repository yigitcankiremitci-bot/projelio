import TabBar from "./TabBar";

export type DepartmentTab = "flow" | "team" | "tasks" | "budget" | "modules" | "files";

// Bir departmanın iç dinamikleri: Sosyal (Twitter mantığında paylaşım/yorum/
// beğeni), Ekip (kadro), Görevler (doğrudan kanban — projedeki gibi ayrı bir
// "Çıktılar" ara katmanı yok), Bütçe (görev bütçesi onay akışı + otomatik
// hesaplanan özetler + genel defter), Modüller (departmana özel etkinleştirilen
// araçlar), Dosyalar (departmana özel Drive klasörü).
const tabs: { key: DepartmentTab; label: string }[] = [
  { key: "flow", label: "Sosyal" },
  { key: "team", label: "Ekip" },
  { key: "tasks", label: "Görevler" },
  { key: "budget", label: "Bütçe" },
  { key: "modules", label: "Modüller" },
  { key: "files", label: "Dosyalar" },
];

interface Props {
  active: DepartmentTab;
  onChange: (tab: DepartmentTab) => void;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. DepartmentDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
}

export default function DepartmentTabs({ active, onChange, style }: Props) {
  return <TabBar tabs={tabs} active={active} onChange={(k) => onChange(k as DepartmentTab)} style={style} />;
}
