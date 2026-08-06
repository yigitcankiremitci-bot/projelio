import { colors } from "../theme/colors";

export type DepartmentTab = "flow" | "team" | "tasks" | "budget" | "modules" | "files";

// ProjectTabs ile aynı sekme görünümü — bir departmanın iç dinamikleri:
// Sosyal (Twitter mantığında paylaşım/yorum/beğeni), Ekip (kadro), Görevler
// (doğrudan kanban — projedeki gibi ayrı bir "Çıktılar" ara katmanı yok), Bütçe
// (görev bütçesi onay akışı + otomatik hesaplanan özetler + genel defter),
// Modüller (departmana özel etkinleştirilen araçlar), Dosyalar (departmana özel
// Drive klasörü).
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
}

export default function DepartmentTabs({ active, onChange }: Props) {
  const c = colors.light;
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: 4,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: "1 1 auto",
            minWidth: 88,
            padding: "8px 0",
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
