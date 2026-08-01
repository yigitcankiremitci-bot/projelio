import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Output, Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import TaskColumn from "./TaskColumn";
import CreateTaskModal from "./CreateTaskModal";

const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

export interface JobTasksPanelHandle {
  openCreate: () => void;
}

interface Props {
  jobId: string;
  projects: Project[];
  tasks: Task[];
  onCreateSubtask: (parentId: string, title: string) => void;
  onMoveTask: (taskId: string, status: TaskStatus) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  onTasksReload: () => void;
  activeTaskId?: string;
  onToggleActive?: (taskId: string) => void;
}

const JobTasksPanel = forwardRef<JobTasksPanelHandle, Props>(function JobTasksPanel(
  { jobId, projects, tasks, onCreateSubtask, onMoveTask, onToggleComplete, onEditTask, onTasksReload, activeTaskId, onToggleActive },
  ref
) {
  const c = colors.light;
  const [creating, setCreating] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreating(true),
  }));

  useEffect(() => {
    if (projects.length === 0) {
      setOutputs([]);
      return;
    }
    Promise.all(
      projects.map((p) => api.get<Output[]>(`/projects/${p.id}/outputs`).catch(() => [] as Output[]))
    ).then((lists) => setOutputs(lists.flat()));
  }, [projects]);

  const projectTitleById = new Map(projects.map((p) => [p.id, p.title]));
  const outputTitleById = new Map(outputs.map((o) => [o.id, o.title]));

  // İşler bölümünde en son eklenen görev yukarıda görünsün.
  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // "Bugün yapılacaklar": bugünü kapsayan (başlangıç ≤ bugün ≤ bitiş) ve henüz
  // tamamlanmamış üst seviye görevler ayrı bir bölümde öne çıkarılır.
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOf = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const todayTasks = sortedTasks.filter((t) => {
    if (t.parentTaskId || t.status === "completed") return false;
    const start = dayOf(t.startDate ?? t.createdAt);
    const end = dayOf(t.deadline);
    return start <= todayDay && todayDay <= end;
  });

  const getTaskMeta = (task: Task): string | undefined => {
    const projectTitle = projectTitleById.get(task.projectId);
    let outputId = task.outputId;
    if (!outputId && task.parentTaskId) {
      const parent = tasks.find((t) => t.id === task.parentTaskId);
      outputId = parent?.outputId;
    }
    const outputTitle = outputId ? outputTitleById.get(outputId) : undefined;
    if (projectTitle && outputTitle) return `${projectTitle} · ${outputTitle}`;
    return projectTitle ?? outputTitle;
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary, margin: 0 }}>İşler</h3>
      </div>

      {tasks.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 16,
          }}
        >
          Bu işte henüz görev yok.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {todayTasks.length > 0 && (
            <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <h4 style={{ color: c.textPrimary, fontSize: 16, fontWeight: 500, margin: 0 }}>Bugün yapılacaklar</h4>
                <span style={{ fontSize: 13, color: c.textSecondary, background: c.background, border: `1px solid ${c.border}`, borderRadius: 20, padding: "1px 7px" }}>
                  {todayTasks.length}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todayTasks.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => onEditTask(t)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: `1px solid ${c.border}`,
                      background: c.background,
                      textAlign: "left",
                    }}
                  >
                    <span style={{ fontSize: 15, color: c.textPrimary, flex: 1, minWidth: 0, overflowWrap: "break-word", wordBreak: "break-word" }}>
                      {t.title}
                    </span>
                    {getTaskMeta(t) && (
                      <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>{getTaskMeta(t)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {columns.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              allTasks={sortedTasks}
              onCreateSubtask={onCreateSubtask}
              onMove={onMoveTask}
              onToggleComplete={onToggleComplete}
              onEditTask={onEditTask}
              group={`tasks-job-${jobId}`}
              activeTaskId={activeTaskId}
              onToggleActive={onToggleActive}
              getTaskMeta={getTaskMeta}
            />
          ))}
        </div>
      )}

      {creating && (
        <CreateTaskModal jobId={jobId} projects={projects} onClose={() => setCreating(false)} onCreated={onTasksReload} />
      )}
    </div>
  );
});

export default JobTasksPanel;
