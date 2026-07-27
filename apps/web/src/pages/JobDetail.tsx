import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Job, Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import ProjectCard from "../components/ProjectCard";
import EditJobModal from "../components/EditJobModal";
import JobTabs, { JobTab } from "../components/JobTabs";
import JobTeamPanel from "../components/JobTeamPanel";
import JobTasksPanel, { JobTasksPanelHandle } from "../components/JobTasksPanel";
import TodayCompletedPanel from "../components/TodayCompletedPanel";
import TaskEditModal from "../components/TaskEditModal";
import Modal from "../components/Modal";
import { colors } from "../theme/colors";
import { IconUser, IconCalendar, IconSettings } from "../components/icons";
import { useSortableList } from "../lib/useSortableList";
import { useProjectFabAction } from "../lib/projectFab";

export default function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const c = colors.light;
  const [job, setJob] = useState<Job | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<JobTab>("projects");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const [currentUserActiveTaskId, setCurrentUserActiveTaskId] = useState<string | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const tasksPanelRef = useRef<JobTasksPanelHandle>(null);

  // "İşler" sekmesindeyken alt navigasyondaki "+" butonu doğrudan görev ekleme
  // formunu açsın (diğer sekmelerde eski proje/görev seçim menüsü geçerli kalır).
  useProjectFabAction(
    activeTab === "tasks" ? { label: "Görev ekle", onClick: () => tasksPanelRef.current?.openCreate() } : null,
    [activeTab]
  );

  const reload = () => {
    if (!id) return;
    api.get<Job>(`/jobs/${id}`).then(setJob).catch(() => setJob(null));
    api.get<Project[]>(`/jobs/${id}/projects`).then(setProjects).catch(() => setProjects([]));
  };

  useEffect(reload, [id]);

  // İşe ait tüm projelerin görev (ve alt görev) sayısını toplamak için
  // her projenin görev listesini çekip birleştiriyoruz.
  const reloadTasks = () => {
    if (projects.length === 0) {
      setTasks([]);
      return;
    }
    Promise.all(
      projects.map((p) => api.get<Task[]>(`/projects/${p.id}/tasks`).catch(() => [] as Task[]))
    ).then((lists) => setTasks(lists.flat()));
  };

  useEffect(reloadTasks, [projects]);

  useEffect(() => {
    api
      .get<{ id: string; activeTaskId?: string } | null>("/auth/me")
      .then((me) => setCurrentUserActiveTaskId(me?.activeTaskId))
      .catch(() => setCurrentUserActiveTaskId(undefined));
  }, []);

  const handleToggleActive = (taskId: string) => {
    const turningOn = currentUserActiveTaskId !== taskId;
    setCurrentUserActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setCurrentUserActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const updateTaskInState = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const removeTaskFromState = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentTaskId !== taskId));
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) return;
    try {
      const created = await api.post<Task>(`/projects/${parent.projectId}/tasks`, {
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
    api
      .patch(`/tasks/${taskId}/status`, { status })
      // Tamamlanma zamanı/kişisi sunucuda hesaplanıyor ("Bugün yapılanlar" için);
      // gerçek değeri almak üzere görevleri yeniden çekiyoruz.
      .then(() => reloadTasks())
      .catch(() => reloadTasks());
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

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        setProjects((prev) => {
          const byId = new Map(prev.map((p) => [p.id, p]));
          return ids.map((pid) => byId.get(pid)!).filter(Boolean);
        });
        api.patch("/projects/reorder", { ids }).catch(() => reload());
      },
    },
    [projects.length === 0, activeTab]
  );

  if (!id) return null;

  const activeProjects = projects.filter((p) => p.status === "active");
  const pendingTasksCount = tasks.filter((t) => t.status !== "completed").length;
  const completedTasksCount = tasks.filter((t) => t.status === "completed").length;

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <div
        style={{
          position: "relative",
          height: 260,
          background: job?.coverImageUrl
            ? `linear-gradient(rgba(255,255,255,0.18), rgba(255,255,255,0.95)), center/cover url(${job.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <div style={{ paddingRight: 64 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: "0 0 4px" }}>
            {job?.title ?? "…"}
          </h1>
          {job?.description && <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 8px" }}>{job.description}</p>}
          {job && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: c.textSecondary }}>
              {job.ownerName && (
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <IconUser size={12} color={c.textSecondary} />
                  {job.ownerName}
                </span>
              )}
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <IconCalendar size={12} color={c.textSecondary} />
                {new Date(job.createdAt).toLocaleDateString("tr-TR")} kuruldu
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => setEditing(true)}
          aria-label="İşi düzenle"
          style={{
            position: "absolute",
            bottom: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 48,
            height: 48,
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            background: c.surface,
            boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
          }}
        >
          <IconSettings size={20} color={c.textSecondary} />
        </button>
      </div>

      <div style={{ padding: "0 28px 28px" }}>
        <Link to="/" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", margin: "14px 0" }}>
          ← İşler
        </Link>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Aktif proje" value={activeProjects.length} />
            <SummaryCard label="Bekleyen görev" value={pendingTasksCount} />
            <SummaryCard label="Tamamlanmış görev" value={completedTasksCount} />
          </div>

          <TodayCompletedPanel tasks={tasks} />

          <JobTabs active={activeTab} onChange={setActiveTab} />

          {activeTab === "projects" && (
            projects.length === 0 ? (
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
                Bu işte henüz proje yok.
              </div>
            ) : (
              <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                {projects.map((p) => (
                  <div key={p.id} data-id={p.id}>
                    <ProjectCard project={p} />
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === "team" && (
            <JobTeamPanel
              jobId={id}
              tasks={tasks}
              projects={projects}
              ownerId={job?.ownerId}
              onTaskUpdated={updateTaskInState}
              onTasksReload={reloadTasks}
            />
          )}

          {activeTab === "tasks" && (
            <JobTasksPanel
              ref={tasksPanelRef}
              jobId={id}
              projects={projects}
              tasks={tasks}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTasksReload={reloadTasks}
              activeTaskId={currentUserActiveTaskId}
              onToggleActive={handleToggleActive}
            />
          )}
        </div>
      </div>

      {editing && job && (
        <EditJobModal
          job={job}
          onClose={() => setEditing(false)}
          onSaved={reload}
          onDeleted={() => navigate("/")}
          onArchived={() => navigate("/")}
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
            updateTaskInState(updated);
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

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  const c = colors.light;
  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ color: c.textSecondary, fontSize: 15, marginBottom: 6 }}>{label}</div>
      <div style={{ color: c.textPrimary, fontSize: 27, fontWeight: 600 }}>{value}</div>
    </div>
  );
}
