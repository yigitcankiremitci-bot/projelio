import { useEffect, useState } from "react";
import type { Job, Project } from "@projelio/shared";
import { api } from "../api/client";
import JobCard from "../components/JobCard";
import { colors } from "../theme/colors";

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const c = colors.light;

  useEffect(() => {
    api.get<Job[]>("/jobs").then(setJobs).catch(() => setJobs([]));
    api.get<Project[]>("/projects").then(setProjects).catch(() => setProjects([]));
  }, []);

  const projectCountByJob = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.jobId] = (acc[p.jobId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>İşlerim</h1>

      {jobs.length === 0 ? (
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
          Henüz iş yok.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {jobs.map((j) => (
            <JobCard key={j.id} job={j} projectCount={projectCountByJob[j.id] ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
