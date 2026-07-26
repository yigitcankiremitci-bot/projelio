import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Job, Project } from "@projelio/shared";
import { api } from "../api/client";
import ProjectCard from "../components/ProjectCard";
import CreateProjectModal from "../components/CreateProjectModal";
import EditJobModal from "../components/EditJobModal";
import { colors } from "../theme/colors";
import { IconPlus, IconUser, IconCalendar, IconSettings } from "../components/icons";

export default function JobDetail() {
  const { id } = useParams();
  const c = colors.light;
  const [job, setJob] = useState<Job | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  const reload = () => {
    if (!id) return;
    api.get<Job>(`/jobs/${id}`).then(setJob).catch(() => setJob(null));
    api.get<Project[]>(`/jobs/${id}/projects`).then(setProjects).catch(() => setProjects([]));
  };

  useEffect(reload, [id]);

  if (!id) return null;

  const activeProjects = projects.filter((p) => p.status === "active");
  const upcoming = [...activeProjects].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  ).slice(0, 5);

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        style={{
          height: 140,
          background: job?.coverImageUrl
            ? `center/cover url(${job.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
        }}
      />

      <div style={{ padding: "0 28px 28px" }}>
        <Link to="/" style={{ fontSize: 12, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}>
          ← İşler
        </Link>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>
              {job?.title ?? "…"}
            </h1>
            {job?.description && <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 8px" }}>{job.description}</p>}
            {job && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: c.textSecondary }}>
                {job.ownerName && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <IconUser size={12} color={c.textSecondary} />
                    {job.ownerName}
                  </span>
                )}
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconCalendar size={12} color={c.textSecondary} />
                  {new Date(job.createdAt).toLocaleDateString("tr-TR")} kuruldu
                </span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => setEditing(true)}
              aria-label="İşi düzenle"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.surface,
              }}
            >
              <IconSettings size={15} color={c.textSecondary} />
            </button>
            <button
              onClick={() => setCreating(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 14px",
                borderRadius: 8,
                border: "none",
                background: c.primary,
                color: "#fff",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              <IconPlus size={14} color="#fff" />
              Yeni proje
            </button>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Aktif proje" value={activeProjects.length} />
            <SummaryCard label="Yaklaşan deadline" value={upcoming.length} />
          </div>

          {projects.length === 0 ? (
            <div
              style={{
                border: `1px dashed ${c.border}`,
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                color: c.textSecondary,
                fontSize: 13,
              }}
            >
              Bu işte henüz proje yok.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          )}
        </div>
      </div>

      {creating && <CreateProjectModal jobId={id} onClose={() => setCreating(false)} onCreated={reload} />}
      {editing && job && <EditJobModal job={job} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  const c = colors.light;
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ color: c.textSecondary, fontSize: 12, marginBottom: 6 }}>{label}</div>
      <div style={{ color: c.textPrimary, fontSize: 22, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
