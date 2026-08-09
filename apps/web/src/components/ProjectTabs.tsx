import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";

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

export default function ProjectTabs({ active, onChange, style }: Props) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  return (
    <div
      style={{
        // 6 sekme dar ekranda tek sirada okunmuyordu. Serbest satir kirilmasi
        // (flex-wrap) genislige gore 4+2 gibi dengesiz bolunmeler uretiyor; grid
        // ile bolunme deterministik: mobilde 3+3, masaustunde tek sira.
        display: "grid",
        gridTemplateColumns: isDesktop
          ? `repeat(${tabs.length}, minmax(0, 1fr))`
          : "repeat(3, minmax(0, 1fr))",
        gap: 4,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 4,
        marginBottom: 16,
        ...style,
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            padding: "8px 4px",
            lineHeight: 1.25,
            // Hucreye sigmayan uzun etiket (ornegin buyutulmus yazi olceginde
            // "Departmanlar") tasmak yerine ikinci satira insin.
            overflowWrap: "break-word",
            borderRadius: 7,
            border: "none",
            background: active === t.key ? c.primary : "transparent",
            color: active === t.key ? "#fff" : c.textSecondary,
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.12s ease, color 0.12s ease",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
