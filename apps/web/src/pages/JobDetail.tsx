import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Job, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import ProjectCard from "../components/ProjectCard";
import EditJobModal from "../components/EditJobModal";
import { colors } from "../theme/colors";
import { IconUser, IconCalendar, IconSettings } from "../components/icons";
import { useSortableList } from "../lib/useSortableList";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const [job, setJob] = useState<Job | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    if (!id) return;
    api.get<Job>(`/jobs/${id}`).then(setJob).catch(() => setJob(null));
    api.get<Project[]>(`/jobs/${id}/projects`).then(setProjects).catch(() => setProjects([]));
  };

  useEffect(reload, [id]);

  // İşe ait tüm projelerin görev (ve alt görev) sayısını toplamak için
  // her projenin görev listesini çekip birleştiriyoruz.
  useEffect(() => {
    if (projects.length === 0) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      projects.map((p) => api.get<Task[]>(`/projects/${p.id}/tasks`).catch(() => [] as Task[]))
    ).then((lists) => {
      if (!cancelled) setTasks(lists.flat());
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        setProjects((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          return ids.map((pid) => byId.get(pid)!).filter(Boolean);
        });
        api.patch("/projects/reorder", { ids }).catch(() => reload());
      },
    },
    [projects.length === 0]
  );

  if (!id) return null;

  const activeProjects = projects.filter((p) => p.status === "active");
  const pendingTasksCount = tasks.filter((t) => t.status !== "completed").length;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        style={{
          position: "relative",
          height: 260,
          background: job?.coverImageUrl
            ? `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.95)), center/cover url(${job.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ paddingRight: 64 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>
            {job?.title ?? "…"}
          </h1>
          {job?.description && <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 8px" }}>{job.description}</p>}
          {job && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: c.textSecondary }}>
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

        <button
          onClick={() => setEditing(true)}
          aria-label="İşi düzenle"
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            background: c.surface,
            boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
          }}
        >
          <IconSettings size={20} color={c.textSecondary} />
        </button>
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <Link to="/" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}>
          ← İşler
        </Link>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Aktif proje" value={activeProjects.length} />
            <SummaryCard label="Bekleyen görev" value={pendingTasksCount} />
          </div>

          {projects.length === 0 ? (
            <div
              style={{
                border: `1px dashed ${c.border}`,
                borderRadius: 12,
                padding: 40,
                textAlign: "center",
                color: c.textSecondary,
                fontSize: 16,
              }}
            >
              Bu işte henüz proje yok.
            </div>
          ) : (
            <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {projects.map((p) => (
                <div key={p.id} data-id={p.id}>
                  <ProjectCard project={p} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && job && (
        <EditJobModal
          job={job}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/")}
          onArchived={() => navigate("/")}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  const c = colors.light;
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ color: c.textSecondary, fontSize: 15, marginBottom: 6 }}>{label}</div>
      <div style={{ color: c.textPrimary, fontSize: 27, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
