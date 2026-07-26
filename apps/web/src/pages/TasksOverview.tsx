import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";

interface TaskWithProject extends Task {
  projectTitle: string;
}

interface DateGroup {
  dateKey: string;
  label: string;
  tasks: TaskWithProject[];
}

export default function TasksOverview() {
  const c = colors.light;
  const [items, setItems] = useState<TaskWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const projects = await api.get<Project[]>("/projects");
        const lists = await Promise.all(
          projects.map((p) =>
            api
              .get<Task[]>(`/projects/${p.id}/tasks`)
              .then((tasks) => tasks.map((t) => ({ ...t, projectTitle: p.title })))
              .catch(() => [] as TaskWithProject[])
          )
        );
        const merged = lists.flat().sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
        if (!cancelled) setItems(merged);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const statusColor: Record<TaskStatus, string> = {
    todo: c.textSecondary,
    in_progress: c.primary,
    completed: c.success,
  };

  const groups: DateGroup[] = [];
  for (const t of items) {
    const d = new Date(t.deadline);
    const dateKey = d.toISOString().slice(0, 10);
    let group = groups.find((g) => g.dateKey === dateKey);
    if (!group) {
      group = {
        dateKey,
        label: d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }),
        tasks: [],
      };
      groups.push(group);
    }
    group.tasks.push(t);
  }

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: "0 0 20px" }}>Yapılacaklar</h1>

      {loading ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
      ) : groups.length === 0 ? (
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
          Görev yok.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {groups.map((g) => (
            <div key={g.dateKey}>
              <h2
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: c.textSecondary,
                  margin: "0 0 8px",
                  textTransform: "capitalize",
                }}
              >
                {g.label}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.tasks.map((t) => (
                  <Link
                    key={t.id}
                    to={`/projects/${t.projectId}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: c.surface,
                      border: `1px solid ${c.border}`,
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: statusColor[t.status],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, color: c.textPrimary, flex: 1 }}>{t.title}</span>
                    <span style={{ fontSize: 11, color: c.textSecondary }}>{t.projectTitle}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
