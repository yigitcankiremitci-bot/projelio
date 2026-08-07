import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Output, Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import TaskColumn from "./TaskColumn";
import TaskSortMenu from "./TaskSortMenu";
import CreateTaskModal from "./CreateTaskModal";
import TaskSelectionBar from "./TaskSelectionBar";
import MoveTaskModal from "./MoveTaskModal";
import { useIsDesktop } from "../lib/useIsDesktop";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";
import { useTaskSelection } from "../lib/useTaskSelection";

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
  // Başlığa çift tıklayarak yerinde ad değiştirme (bkz. TaskColumn.onTaskRenamed).
  onTaskRenamed?: (updated: Task) => void;
  onTasksReload: () => void;
  activeTaskId?: string;
  onToggleActive?: (taskId: string) => void;
}

const JobTasksPanel = forwardRef<JobTasksPanelHandle, Props>(function JobTasksPanel(
  { jobId, projects, tasks, onCreateSubtask, onMoveTask, onToggleComplete, onEditTask, onTaskRenamed, onTasksReload, activeTaskId, onToggleActive },
  ref
) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const [creating, setCreating] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const selection = useTaskSelection();
  const [sort, setSort] = useState<TaskSortMode>("manual");
  const [duplicating, setDuplicating] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreating(true),
  }));

  const handleDuplicateSelected = async () => {
    if (selection.selectedIds.size === 0) return;
    setDuplicating(true);
    try {
      await api.post<Task[]>("/tasks/duplicate", { ids: Array.from(selection.selectedIds) });
      onTasksReload();
      selection.clear();
    } catch {
      // çoğaltılamadı, kullanıcı tekrar deneyebilir
    } finally {
      setDuplicating(false);
    }
  };

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

  // Bu panoda elle sıralama yok; "Kendi sıram" burada panonun kendi varsayılanı
  // demek: en son eklenen görev yukarıda. Diğer ölçütler ortak sıralamaya devreder.
  const defaultOrdered = [...tasks].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const sortedTasks = sort === "manual" ? defaultOrdered : sortTasks(tasks, sort);

  // "Bugün yapılacaklar": bugünü kapsayan (başlangıç ≤ bugün ≤ bitiş) ve henüz
  // tamamlanmamış üst seviye görevler ayrı bir bölümde öne çıkarılır.
  const now = new Date();
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOf = (iso: string) => {
    const d = new Date(iso);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };
  const todayTasks = defaultOrdered.filter((t) => {
    if (t.parentTaskId || t.status === "completed") return false;
    const start = dayOf(t.startDate ?? t.createdAt);
    const end = dayOf(t.deadline);
    return start <= todayDay && todayDay <= end;
  });

  const getTaskMeta = (task: Task): string | undefined => {
    const projectTitle = task.projectId ? projectTitleById.get(task.projectId) : undefined;
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

      {tasks.length > 0 && (
        // Tek satırlık araç çubuğu: sağda sıralama ve seçim. Seçim modu
        // açıldığında bar tam genişlik alıp alta kayar.
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <div style={{ marginLeft: "auto" }}>
            <TaskSortMenu value={sort} onChange={setSort} />
          </div>
          <TaskSelectionBar
            inline
            selectionMode={selection.selectionMode}
            selectedCount={selection.selectedIds.size}
            busy={duplicating}
            onEnable={selection.toggleSelectionMode}
            onCancel={selection.clear}
            onDuplicate={handleDuplicateSelected}
            onMove={() => setMovingOpen(true)}
          />
        </div>
      )}

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

          {/* Masaüstünde üç sütun yan yana, dar ekranda alt alta. */}
          <div
            style={{
              display: "flex",
              flexDirection: isDesktop ? "row" : "column",
              alignItems: isDesktop ? "flex-start" : undefined,
              gap: 14,
              overflowX: isDesktop ? "auto" : undefined,
            }}
          >
            {columns.map((status) => (
              <div
                key={status}
                style={isDesktop ? { flex: "1 1 260px", minWidth: 260 } : { width: "100%" }}
              >
                <TaskColumn
                  status={status}
                  allTasks={sortedTasks}
                  onCreateSubtask={onCreateSubtask}
                  onMove={onMoveTask}
                  onToggleComplete={onToggleComplete}
                  onEditTask={onEditTask}
                  onTaskRenamed={onTaskRenamed}
                  group={`tasks-job-${jobId}`}
                  activeTaskId={activeTaskId}
                  onToggleActive={onToggleActive}
                  getTaskMeta={getTaskMeta}
                  selectionMode={selection.selectionMode}
                  selectedIds={selection.selectedIds}
                  onToggleSelect={selection.toggleSelect}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <CreateTaskModal jobId={jobId} projects={projects} onClose={() => setCreating(false)} onCreated={onTasksReload} />
      )}

      {movingOpen && (
        <MoveTaskModal
          taskIds={Array.from(selection.selectedIds)}
          onClose={() => setMovingOpen(false)}
          onMoved={() => {
            selection.clear();
            onTasksReload();
          }}
        />
      )}
    </div>
  );
});

export default JobTasksPanel;
