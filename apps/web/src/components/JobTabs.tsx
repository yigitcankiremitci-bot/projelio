import { colors } from "../theme/colors";
import { useIsDesktop } from "../lib/useIsDesktop";

export type JobTab = "projects" | "programs" | "team" | "tasks" | "files";

// Projeler süreli ve biten işleri, Programlar süresiz ve tekrarlayan işleri tutar.
// İkisi de bu işin altında yaşadığı için sekmeler yan yana durur.
const tabs: { key: JobTab; label: string }[] = [
  { key: "projects", label: "Projeler" },
  { key: "programs", label: "Programlar" },
  { key: "team", label: "Ekip" },
  { key: "tasks", label: "İşler" },
  // Dosyalar işe aittir: iş sahibi altındaki tüm projelerin dosyalarını burada görür.
  { key: "files", label: "Dosyalar" },
];

interface Props {
  active: JobTab;
  onChange: (tab: JobTab) => void;
}

export default function JobTabs({ active, onChange }: Props) {
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
