import { useEffect, useState } from "react";
import type { Department, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";

type TargetType = "project" | "department";

interface Props {
  taskIds: string[];
  onClose: () => void;
  onMoved: (movedTasks: Task[]) => void;
}

// Seçili görev(ler)i (üst görevse alt görevleriyle birlikte) başka bir projeye ya da
// departmana taşır. Hedef önce tür (Proje/Departman) sonra o türün listesinden
// seçilir — GET /projects ve GET /departments kullanıcının erişebildiği TÜM
// projeler/departmanlar (iş/organizasyon sınırı olmadan) döner.
export default function MoveTaskModal({ taskIds, onClose, onMoved }: Props) {
  const c = colors.light;
  const [targetType, setTargetType] = useState<TargetType>("project");
  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetId, setTargetId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Project[]>("/projects").catch(() => []),
      api.get<Department[]>("/departments").catch(() => []),
    ])
      .then(([p, d]) => {
        setProjects(p);
        setDepartments(d);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setTargetId("");
    setError("");
  }, [targetType]);

  const options = targetType === "project" ? projects : departments;

  const handleSave = async () => {
    if (!targetId) {
      setError(targetType === "project" ? "Bir proje seç" : "Bir departman seç");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const moved = await api.patch<Task[]>("/tasks/move", {
        ids: taskIds,
        projectId: targetType === "project" ? targetId : undefined,
        departmentId: targetType === "department" ? targetId : undefined,
      });
      onMoved(moved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görev taşınamadı");
      setSaving(false);
    }
  };

  return (
    <Modal title="Görevi taşı" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {taskIds.length > 1 ? `${taskIds.length} görev` : "Görev"} seçtiğin hedefe taşınacak (varsa alt görevleriyle birlikte).
        </p>

        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => setTargetType("project")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: `1.5px solid ${targetType === "project" ? c.primary : c.border}`,
              background: targetType === "project" ? c.background : "transparent",
              color: c.textPrimary,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Proje
          </button>
          <button
            type="button"
            onClick={() => setTargetType("department")}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: `1.5px solid ${targetType === "department" ? c.primary : c.border}`,
              background: targetType === "department" ? c.background : "transparent",
              color: c.textPrimary,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Departman
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>
            {targetType === "project" ? "Hedef proje" : "Hedef departman"}
          </label>
          {loading ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
          ) : options.length === 0 ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
              {targetType === "project" ? "Erişebildiğin proje yok." : "Erişebildiğin departman yok."}
            </p>
          ) : (
            <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: "100%" }}>
              <option value="">Seç…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {targetType === "project" ? (o as Project).title : (o as Department).name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving || !targetId}
          style={{
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
            opacity: !targetId ? 0.6 : 1,
          }}
        >
          {saving ? "Taşınıyor…" : "Taşı"}
        </button>
      </div>
    </Modal>
  );
}
