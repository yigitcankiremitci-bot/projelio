import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import TaskColumn from "../components/TaskColumn";
import { colors } from "../theme/colors";

const columns: TaskStatus[] = ["todo", "in_progress", "completed"];

export default function ProjectDetail() {
  const { id } = useParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const c = colors.light;

  useEffect(() => {
    if (!id) return;
    api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => setTasks([]));
  }, [id]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: c.textPrimary }}>Proje Detayı</h1>
      <div style={{ display: "flex", gap: 16 }}>
        {columns.map((status) => (
          <TaskColumn key={status} status={status} tasks={tasks.filter((t) => t.status === status)} />
        ))}
      </div>
    </div>
  );
}
