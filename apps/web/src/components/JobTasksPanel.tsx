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
          {columns.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              allTasks={tasks}
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
