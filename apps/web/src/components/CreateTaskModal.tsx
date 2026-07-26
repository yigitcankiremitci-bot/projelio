import { useEffect, useState } from "react";
import type { Project } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

interface Props {
  projectId?: string;
  onClose: () => void;
}

export default function CreateTaskModal({ projectId: fixedProjectId, onClose }: Props) {
  const c = colors.light;
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(fixedProjectId ?? "");
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(!fixedProjectId);

  useEffect(() => {
    if (fixedProjectId) return;
    api
      .get<Project[]>("/projects")
      .then((ps) => {
        setProjects(ps);
        if (ps.length > 0) setProjectId(ps[0].id);
      })
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [fixedProjectId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    setError("");
    setLoading(true);
    try {
      await api.post(`/projects/${projectId}/tasks`, {
        title,
        deadline: deadline ? new Date(deadline).toISOString() : new Date().toISOString(),
        status: "todo",
      });
      window.location.href = `/projects/${projectId}`;
    } catch {
      setError("Görev oluşturulamadı. Tekrar dene.");
      setLoading(false);
    }
  };

  return (
    <Modal title="Yeni görev" onClose={onClose}>
      {loadingProjects ? (
        <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>Projeler yükleniyor…</p>
      ) : !fixedProjectId && projects.length === 0 ? (
        <p style={{ fontSize: 16, color: c.textSecondary, margin: 0 }}>
          Görev eklemek için önce bir proje oluşturman gerekiyor.
        </p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {!fixedProjectId && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 15, color: c.textSecondary }}>Proje</label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: "100%" }}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Görev başlığı</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Örn. Logo revizyonu" maxLength={200} style={{ width: "100%" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Bitiş tarihi</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} required style={{ width: "100%" }} />
          </div>

          {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
          >
            {loading ? "Oluşturuluyor…" : "Görev oluştur"}
          </button>
        </form>
      )}
    </Modal>
  );
}
