import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import StatusBadge from "../components/StatusBadge";
import EditProjectModal from "../components/EditProjectModal";
import ExtendDeadlineModal from "../components/ExtendDeadlineModal";
import TaskEditModal from "../components/TaskEditModal";
import Modal from "../components/Modal";
import ProjectTabs, { ProjectTab } from "../components/ProjectTabs";
import FeedPanel, { FeedPanelHandle } from "../components/panels/FeedPanel";
import TeamPanel, { TeamPanelHandle } from "../components/panels/TeamPanel";
import BudgetPanel, { BudgetPanelHandle } from "../components/panels/BudgetPanel";
import OutputsPanel, { OutputsPanelHandle } from "../components/OutputsPanel";
import ProcessPanel, { ProcessNavState, ViewMode, computeInitialProcessNavDates } from "../components/panels/ProcessPanel";
import { colors } from "../theme/colors";
import { IconSettings } from "../components/icons";
import { useProjectFabAction } from "../lib/projectFab";

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTab>("tasks");
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const [extendingDeadline, setExtendingDeadline] = useState(false);
  const c = colors.light;
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const outputsRef = useRef<OutputsPanelHandle>(null);
  const feedRef = useRef<FeedPanelHandle>(null);
  const teamRef = useRef<TeamPanelHandle>(null);
  const budgetRef = useRef<BudgetPanelHandle>(null);

  // Alt navigasyondaki "+" butonu, proje detayında hangi sekmedeysek ona uygun eylemi
  // tetiklesin diye ProjectFabContext üzerinden kayıt yapılır (sekme değiştikçe güncellenir).
  useProjectFabAction(
    !project || !id
      ? null
      : activeTab === "tasks"
      ? { label: "Yeni çıktı", onClick: () => outputsRef.current?.openCreate() }
      : activeTab === "feed"
      ? { label: "Yeni paylaşım", onClick: () => feedRef.current?.openCreate() }
      : activeTab === "team"
      ? { label: "Üye ekle", onClick: () => teamRef.current?.openCreate() }
      : activeTab === "budget"
      ? { label: "Gelir/Gider ekle", onClick: () => budgetRef.current?.openCreate() }
      : { label: "Deadline'ı değiştir", onClick: () => setExtendingDeadline(true) },
    [activeTab, project, id]
  );

  // Süreç sekmesinin gün/hafta/ay/yıl gezinme durumu burada tutulur ki sekme değiştirince kaybolmasın.
  const [processViewMode, setProcessViewMode] = useState<ViewMode>("week");
  const [processSelectedDay, setProcessSelectedDay] = useState<Date>(new Date());
  const [processViewingDay, setProcessViewingDay] = useState<Date>(new Date());
  const [processSelectedWeek, setProcessSelectedWeek] = useState<number | null>(null);
  const [processViewingWeek, setProcessViewingWeek] = useState<number>(1);
  const [processSelectedMonth, setProcessSelectedMonth] = useState<number | null>(null);
  const [processViewingMonth, setProcessViewingMonth] = useState<number>(1);
  const [processSelectedYear, setProcessSelectedYear] = useState<number | null>(null);
  const processNavInitialized = useRef(false);

  const processNav: ProcessNavState = {
    viewMode: processViewMode,
    setViewMode: setProcessViewMode,
    selectedDay: processSelectedDay,
    setSelectedDay: setProcessSelectedDay,
    viewingDay: processViewingDay,
    setViewingDay: setProcessViewingDay,
    selectedWeek: processSelectedWeek,
    setSelectedWeek: setProcessSelectedWeek,
    viewingWeek: processViewingWeek,
    setViewingWeek: setProcessViewingWeek,
    selectedMonth: processSelectedMonth,
    setSelectedMonth: setProcessSelectedMonth,
    viewingMonth: processViewingMonth,
    setViewingMonth: setProcessViewingMonth,
    selectedYear: processSelectedYear,
    setSelectedYear: setProcessSelectedYear,
  };

  useEffect(() => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then(setProject).catch(() => setProject(null));
    api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => setTasks([]));
  }, [id]);

  // Proje ilk yüklendiğinde Süreç gezinmesini bugüne/bu haftaya/bu aya sabitlenmiş makul varsayılanlarla başlat (yalnızca bir kez).
  useEffect(() => {
    if (!project || processNavInitialized.current) return;
    processNavInitialized.current = true;
    const defaults = computeInitialProcessNavDates(project);
    setProcessViewingWeek(defaults.viewingWeek);
    setProcessSelectedWeek(defaults.selectedWeek);
    setProcessViewingMonth(defaults.viewingMonth);
    setProcessSelectedMonth(defaults.selectedMonth);
    setProcessSelectedYear(defaults.selectedYear);
    setProcessSelectedDay(defaults.selectedDay);
    setProcessViewingDay(defaults.viewingDay);
  }, [project]);

  useEffect(() => {
    api
      .get<{ id: string; activeTaskId?: string } | null>("/auth/me")
      .then((me) => {
        setCurrentUserId(me?.id);
        setActiveTaskId(me?.activeTaskId);
      })
      .catch(() => setCurrentUserId(undefined));
  }, []);

  const handleToggleActive = (taskId: string) => {
    const turningOn = activeTaskId !== taskId;
    setActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const updateTask = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const removeTaskFromState = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentTaskId !== taskId));
  };

  const handleCreateTask = async (
    status: TaskStatus,
    title: string,
    options?: { weekNumber?: number; deadline?: string; startDate?: string; outputId?: string }
  ) => {
    if (!id) return;
    const deadline = options?.deadline ?? project?.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const created = await api.post<Task>(`/projects/${id}/tasks`, {
        title,
        status,
        deadline,
        startDate: options?.startDate,
        weekNumber: options?.weekNumber,
        outputId: options?.outputId,
      });
      setTasks((prev) => [...prev, created]);
    } catch {
      // görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    if (!id) return;
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) return;
    try {
      const created = await api.post<Task>(`/projects/${id}/tasks`, {
        title,
        status: parent.status,
        deadline: parent.deadline,
        parentTaskId,
      });
      setTasks((prev) => [...prev, created]);
    } catch {
      // alt görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleMoveTask = (taskId: string, status: TaskStatus) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    api.patch(`/tasks/${taskId}/status`, { status }).catch(() => {
      if (id) api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => {});
    });
  };

  const handleReorderTasks = (ids: string[]) => {
    if (!ids.length) return;
    setTasks((prev) => {
      const order = new Map(ids.map((taskId, index) => [taskId, index]));
      const affected = prev.filter((t) => order.has(t.id));
      const untouched = prev.filter((t) => !order.has(t.id));
      affected.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      return [...untouched, ...affected];
    });
    api.patch("/tasks/reorder", { ids }).catch(() => {
      if (id) api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => {});
    });
  };

  const handleToggleComplete = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === "completed") {
      const previous = previousStatusRef.current[taskId] ?? "todo";
      delete previousStatusRef.current[taskId];
      handleMoveTask(taskId, previous);

      if (task.parentTaskId) {
        const parent = tasks.find((p) => p.id === task.parentTaskId);
        if (parent && parent.status === "completed") {
          handleMoveTask(parent.id, "in_progress");
        }
      }
    } else {
      previousStatusRef.current[taskId] = task.status;
      handleMoveTask(taskId, "completed");
      tasks
        .filter((t) => t.parentTaskId === taskId && t.status !== "completed")
        .forEach((sub) => {
          previousStatusRef.current[sub.id] = sub.status;
          handleMoveTask(sub.id, "completed");
        });

      if (task.parentTaskId) {
        const parent = tasks.find((p) => p.id === task.parentTaskId);
        if (parent && parent.status !== "completed") {
          const siblings = tasks.filter((t) => t.parentTaskId === parent.id);
          const allDone = siblings.every((s) => s.id === taskId || s.status === "completed");
          if (allDone) setParentCompletePrompt(parent);
        }
      }
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <Link
        to={project ? `/jobs/${project.jobId}` : "/"}
        style={{ fontSize: 15, color: c.textSecondary, marginBottom: 4, display: "inline-block" }}
      >
        ← Projeler
      </Link>

      {project && (() => {
        const hasCover = Boolean(project.coverImageUrl);
        return (
          <div
            style={{
              position: "relative",
              background: hasCover
                ? `linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.92)), center/cover url(${project.coverImageUrl})`
                : c.surface,
              border: hasCover ? "none" : `1px solid ${c.border}`,
              borderRadius: 12,
              padding: 18,
              margin: "10px 0 24px",
              minHeight: hasCover ? 260 : undefined,
              display: hasCover ? "flex" : undefined,
              flexDirection: hasCover ? "column" : undefined,
              justifyContent: hasCover ? "flex-end" : undefined,
            }}
          >
            <div style={{ paddingRight: 64, marginBottom: project.description ? 8 : 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{project.title}</h1>
                <StatusBadge status={project.status} />
              </div>
            </div>

            {project.description && (
              <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 14px" }}>
                {project.description}
              </p>
            )}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 24,
                fontSize: 15,
                color: c.textSecondary,
                borderTop: hasCover ? "1px solid rgba(26,31,41,0.2)" : `1px solid ${c.border}`,
                paddingTop: 12,
              }}
            >
              <span>
                Bütçe: <span style={{ color: c.accentDark, fontWeight: 500 }}>{project.totalBudget.toLocaleString("tr-TR")} ₺</span>
              </span>
              <span>Başlangıç: {new Date(project.startDate).toLocaleDateString("tr-TR")}</span>
              <span>Bitiş: {new Date(project.deadline).toLocaleDateString("tr-TR")}</span>
            </div>

            <button
              onClick={() => setEditing(true)}
              aria-label="Projeyi düzenle"
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 40,
                height: 40,
                borderRadius: 10,
                border: hasCover ? `1px solid rgba(26,31,41,0.2)` : `1px solid ${c.border}`,
                background: hasCover ? "rgba(255,255,255,0.7)" : c.surface,
                boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
              }}
            >
              <IconSettings size={17} color={c.textSecondary} />
            </button>
          </div>
        );
      })()}

      {project && id && (
        <div style={{ marginBottom: 24 }}>
          <ProjectTabs active={activeTab} onChange={setActiveTab} />

          {activeTab === "feed" && <FeedPanel ref={feedRef} projectId={id} tasks={tasks} />}
          {activeTab === "team" && (
            <TeamPanel ref={teamRef} projectId={id} tasks={tasks} ownerId={project.ownerId} onTaskUpdated={updateTask} />
          )}
          {activeTab === "tasks" && (
            <OutputsPanel
              ref={outputsRef}
              projectId={id}
              tasks={tasks}
              onCreateTask={handleCreateTask}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onReorderTasks={handleReorderTasks}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
            />
          )}
          {activeTab === "budget" && (
            <BudgetPanel
              ref={budgetRef}
              project={project}
              tasks={tasks}
              projectId={id}
              currentUserId={currentUserId}
              isOwner={currentUserId === project.ownerId}
              onTaskUpdated={updateTask}
            />
          )}
          {activeTab === "process" && (
            <ProcessPanel
              project={project}
              tasks={tasks}
              onCreateTask={handleCreateTask}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              nav={processNav}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
            />
          )}
        </div>
      )}

      {editing && project && <EditProjectModal project={project} onClose={() => setEditing(false)} />}

      {extendingDeadline && project && (
        <ExtendDeadlineModal
          project={project}
          onClose={() => setExtendingDeadline(false)}
          onSaved={(updated) => {
            setProject(updated);
            setExtendingDeadline(false);
          }}
        />
      )}

      {parentCompletePrompt && (
        <Modal title="Görevi tamamla" onClose={() => setParentCompletePrompt(null)}>
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{parentCompletePrompt.title}</strong> görevinin tüm alt
            görevleri tamamlandı. Bu görevi de tamamlandı olarak işaretlemek ister misin?
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setParentCompletePrompt(null)}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 16 }}
            >
              Hayır
            </button>
            <button
              onClick={() => {
                handleToggleComplete(parentCompletePrompt.id);
                setParentCompletePrompt(null);
              }}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 16, fontWeight: 500 }}
            >
              Evet, tamamla
            </button>
          </div>
        </Modal>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSaved={(updated) => {
            updateTask(updated);
            setEditingTask(null);
          }}
          onDeleted={(deletedTaskId) => {
            removeTaskFromState(deletedTaskId);
            setEditingTask(null);
          }}
          onArchived={(archivedTaskId) => {
            removeTaskFromState(archivedTaskId);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
}
