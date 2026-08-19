import type { DepartmentAccess } from "@projelio/shared";
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

/**
 * Kullanıcının GERÇEKTEN açabileceği sekmeler.
 *
 * Asıl kısıt sunucudadır (bkz. backend department-access.ts); burada sekmeyi
 * gizlemenin amacı güvenlik değil, dürüstlük: taşerona tıkladığında 403 alacağı
 * bir "Bütçe" sekmesi göstermek, olmayan bir yetkiyi varmış gibi sunmaktır.
 *
 * access verilmemişse (ör. departman henüz yüklenmedi) hepsi gösterilir —
 * yükleme sırasında sekmelerin sırayla belirip kaymasını engeller.
 */
export function visibleDepartmentTabs(access?: DepartmentAccess): { key: DepartmentTab; label: string }[] {
  if (!access) return tabs;
  return tabs.filter((t) => {
    if (t.key === "budget") return access.canViewBudget;
    if (t.key === "team") return access.canViewTeam;
    return true;
  });
}

interface Props {
  active: DepartmentTab;
  onChange: (tab: DepartmentTab) => void;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. DepartmentDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
  /** Tek satır + yana kaydırma (bkz. TabBar): sabit şeritteki kopya kullanır. */
  scrollable?: boolean;
  /** İsteyen kullanıcının bu departmandaki görünürlüğü (sunucudan gelir). */
  access?: DepartmentAccess;
}

export default function DepartmentTabs({ active, onChange, style, scrollable, access }: Props) {
  return (
    <TabBar
      tabs={visibleDepartmentTabs(access)}
      active={active}
      onChange={(k) => onChange(k as DepartmentTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
