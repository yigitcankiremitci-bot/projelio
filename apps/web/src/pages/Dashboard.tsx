import { useEffect, useState } from "react";
import type { Project } from "@projelio/shared";
import { api } from "../api/client";
import ProjectCard from "../components/ProjectCard";
import { colors } from "../theme/colors";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const c = colors.light;

  useEffect(() => {
    api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  const active = projects.filter((p) => p.status === "active");
  const upcoming = [...active].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  ).slice(0, 5);
  const totalBudget = projects.reduce((sum, p) => sum + p.totalBudget, 0);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: c.textPrimary }}>Ana Sayfa</h1>

      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        <SummaryCard label="Aktif Projeler" value={active.length} />
        <SummaryCard label="Yaklaşan Deadline" value={upcoming.length} />
        <SummaryCard
          label="Toplam Bütçe"
          value={`${totalBudget.toLocaleString("tr-TR")} ₺`}
        />
      </div>

      <h2 style={{ color: c.textPrimary }}>Projeler</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  const c = colors.light;
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16, flex: 1 }}>
      <div style={{ color: c.textSecondary, fontSize: 13 }}>{label}</div>
      <div style={{ color: c.primary, fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
