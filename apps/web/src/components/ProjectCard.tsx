import type { Project } from "@projelio/shared";
import { colors } from "../theme/colors";

interface Props {
  project: Project;
}

const statusLabel: Record<Project["status"], string> = {
  active: "Aktif",
  completed: "Tamamlandı",
  archived: "Arşivlendi",
};

export default function ProjectCard({ project }: Props) {
  const c = colors.light;
  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 16,
        background: c.surface,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, color: c.textPrimary }}>{project.title}</h3>
        <span style={{ color: c.accent, fontWeight: 600 }}>
          {statusLabel[project.status]}
        </span>
      </div>
      <p style={{ color: c.textSecondary }}>{project.description}</p>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
        <span>Bütçe: {project.totalBudget.toLocaleString("tr-TR")} ₺</span>
        <span>Bitiş: {new Date(project.deadline).toLocaleDateString("tr-TR")}</span>
      </div>
    </div>
  );
}
