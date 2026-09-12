import TabBar from "./TabBar";

export type JobTab = "projects" | "programs" | "team" | "tasks" | "budget" | "files";

// Projeler süreli ve biten işleri, Rutinler (kodda "program"/"operation") süresiz
// ve tekrarlayan işleri tutar. İkisi de bu işin altında yaşadığı için sekmeler
// yan yana durur.
export const JOB_TABS: { key: JobTab; label: string }[] = [
  { key: "projects", label: "Projeler" }, // dil:anahtar
  { key: "programs", label: "Rutinler" }, // dil:anahtar
  { key: "team", label: "Ekip" }, // dil:anahtar
  { key: "tasks", label: "İşler" }, // dil:anahtar
  // Bütçe de işe aittir: altındaki projelerin bütçeleri burada TOPLANIR ve
  // projeye dağıtılmayan (işin kendisine ait) gelir/giderler burada tutulur.
  { key: "budget", label: "Bütçe" }, // dil:anahtar
  // Dosyalar işe aittir: iş sahibi altındaki tüm projelerin dosyalarını burada görür.
  { key: "files", label: "Dosyalar" }, // dil:anahtar
  // Modüllerin AYRI BİR SEKMESİ YOK: işe atanan modüller Projeler sekmesinin
  // altında, proje kartlarının hemen ardında duruyor. Sekme olduğu sürece
  // kullanıcı modülün orada olduğunu bilmiyordu — modül, işin bir parçası
  // olduğu hâlde ayrı bir sayfaya sürgün edilmişti (bkz. JobDetail).
];

/**
 * Taşerona kapalı iş sekmeleri: Ekip (kim çalışıyor) ve Bütçe. Taşeron işi
 * görür — orada çalışıyor — ama işin ekibini ve finansal defterini görmez.
 * Sunucu da bu uçları reddeder (bkz. backend job-members controller,
 * butce-erisim.ts). Modüller sekmesi kalktı; modül listesi Projeler sekmesinde
 * ve taşerona orada da çizilmiyor (bkz. JobDetail).
 */
const SUBCONTRACTOR_HIDDEN: JobTab[] = ["team", "budget"];

/**
 * Önce YETKİ (taşerona kapalı olanlar), sonra SAHİBİN TERCİHİ (iş ayarlarından
 * kapattığı sekmeler, bkz. Job.hiddenTabs). Kapatma tercihi yetki değildir:
 * taşerona kapalı bir sekmeyi açamaz.
 */
export function visibleJobTabs(isSubcontractor: boolean, hiddenTabs?: string[]): { key: JobTab; label: string }[] {
  const hidden = new Set(hiddenTabs ?? []);
  return JOB_TABS.filter((t) => {
    if (hidden.has(t.key)) return false;
    return !(isSubcontractor && SUBCONTRACTOR_HIDDEN.includes(t.key));
  });
}

interface Props {
  active: JobTab;
  onChange: (tab: JobTab) => void;
  /** Taşeron hesabı ise Ekip ve Bütçe sekmeleri hiç render edilmez. */
  isSubcontractor?: boolean;
  // Sabit başlığın üst bandındaki küçültülmüş kopya (bkz. JobDetail
  // usePageHeaderTabs) marginBottom'u kaldırmak için kullanır.
  style?: React.CSSProperties;
  /** Tek satır + yana kaydırma (bkz. TabBar): sabit şeritteki kopya kullanır. */
  scrollable?: boolean;
  /** Sahibinin ayarlardan kapattığı sekmeler (Job.hiddenTabs). */
  hiddenTabs?: string[];
}

export default function JobTabs({ active, onChange, style, scrollable, isSubcontractor = false, hiddenTabs }: Props) {
  return (
    <TabBar
      tabs={visibleJobTabs(isSubcontractor, hiddenTabs)}
      active={active}
      onChange={(k) => onChange(k as JobTab)}
      style={style}
      scrollable={scrollable}
    />
  );
}
