import { Link } from "react-router-dom";
import type { Project } from "@projelio/shared";
import { colors } from "../theme/colors";
import StatusBadge from "./StatusBadge";

interface Props {
  project: Project;
}

export default function ProjectCard({ project }: Props) {
  const c = colors.light;
  return (
    <Link
      to={`/projects/${project.id}`}
      draggable={false}
      style={{
        display: "block",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
      }}
    >
      <div
        style={{
          aspectRatio: "3 / 1",
          background: project.coverImageUrl
            ? `center/cover url(${project.coverImageUrl})`
            : `linear-gradient(135deg, ${c.accent}, ${c.accentDark})`,
        }}
      />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{project.title}</h3>
          <StatusBadge status={project.status} />
        </div>
        {project.description && (
          <p style={{ color: c.textSecondary, fontSize: 15, margin: "0 0 14px", lineHeight: 1.5 }}>
            {project.description}
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          <span style={{ color: c.accentDark, fontWeight: 500 }}>
            {project.totalBudget.toLocaleString("tr-TR")} ₺
          </span>
          <span style={{ color: c.textSecondary }}>
            {new Date(project.deadline).toLocaleDateString("tr-TR")}
          </span>
        </div>
      </div>
    </Link>
  );
}
