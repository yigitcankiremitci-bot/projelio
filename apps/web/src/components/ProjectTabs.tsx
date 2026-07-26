import { colors } from "../theme/colors";

export type ProjectTab = "feed" | "team" | "tasks" | "budget" | "process";

const tabs: { key: ProjectTab; label: string }[] = [
  { key: "feed", label: "Akış" },
  { key: "team", label: "Ekip" },
  { key: "tasks", label: "Çıktılar" },
  { key: "budget", label: "Bütçe" },
  { key: "process", label: "Süreç" },
];

interface Props {
  active: ProjectTab;
  onChange: (tab: ProjectTab) => void;
}

export default function ProjectTabs({ active, onChange }: Props) {
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
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            padding: "8px 0",
            borderRadius: 7,
            border: "none",
            background: active === t.key ? c.primary : "transparent",
            color: active === t.key ? "#fff" : c.textSecondary,
            fontSize: 13,
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
