import { useEffect, useRef, useState } from "react";
import type { Job, Project } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import { colors } from "../theme/colors";
import { useSortableList } from "../lib/useSortableList";

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const c = colors.light;
  const gridRef = useRef<HTMLDivElement>(null);

  const reloadJobs = () => {
    api.get<Job[]>("/jobs").then(setJobs).catch(() => setJobs([]));
  };

  useEffect(() => {
    reloadJobs();
    api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        setJobs((prev) => {
          const byId = new Map(prev.map((j) => [j.id, j]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch("/jobs/reorder", { ids }).catch(() => reloadJobs());
      },
    },
    [jobs.length === 0]
  );

  const projectCountByJob = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.jobId] = (acc[p.jobId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>İşlerim</h1>

      {jobs.length === 0 ? (
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
          Henüz iş yok.
        </div>
      ) : (
        <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {jobs.map((j) => (
            <div key={j.id} data-id={j.id}>
              <JobCard job={j} projectCount={projectCountByJob[j.id] ?? 0} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
