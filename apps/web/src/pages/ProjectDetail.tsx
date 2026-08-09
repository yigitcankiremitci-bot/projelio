import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
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
import FilesPanel, { FilesPanelHandle } from "../components/FilesPanel";
import ProcessPanel, { ProcessNavState, ViewMode, computeInitialProcessNavDates } from "../components/panels/ProcessPanel";
import { colors } from "../theme/colors";
import { IconSettings } from "../components/icons";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageHeader, usePageHeaderTabs } from "../lib/pageHeader";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useUndo } from "../lib/undo";

export default function ProjectDetail() {
  const { id } = useParams();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const { pushUndo } = useUndo();
  const registerReorderUndo = useReorderUndo();
  const tasksRef = useLatestRef(tasks);
  const [editing, setEditing] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectTab>("tasks");
  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const [extendingDeadline, setExtendingDeadline] = useState(false);
  const [highlightTaskId, setHighlightTaskId] = useState<string | undefined>(undefined);
  const c = colors.light;
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const outputsRef = useRef<OutputsPanelHandle>(null);
  const feedRef = useRef<FeedPanelHandle>(null);
  const teamRef = useRef<TeamPanelHandle>(null);
  const budgetRef = useRef<BudgetPanelHandle>(null);
  const filesRef = useRef<FilesPanelHandle>(null);

  // Alt navigasyondaki "+" butonu, proje detayında hangi sekmedeysek ona uygun eylemi
  // tetiklesin diye ProjectFabContext üzerinden kayıt yapılır (sekme değiştikçe güncellenir).
  useProjectFabAction(
    !project || !id
      ? null
      : activeTab === "tasks"
      ? {
          // Sekme hem görev hem çıktı barındırıyor; "+" hangisini eklediğini
          // sormalı (bkz. BottomNav'daki seçim menüsü deseni).
          label: "Görev veya çıktı ekle",
          options: [
            { label: "Yeni görev", onClick: () => outputsRef.current?.openCreateTask() },
            { label: "Yeni çıktı", onClick: () => outputsRef.current?.openCreateOutput() },
          ],
        }
      : activeTab === "feed"
      ? { label: "Yeni paylaşım", onClick: () => feedRef.current?.openCreate() }
      : activeTab === "team"
      ? { label: "Üye ekle", onClick: () => teamRef.current?.openCreate() }
      : activeTab === "budget"
      ? { label: "Ödeme / gider ekle", onClick: () => budgetRef.current?.openCreate() }
      : activeTab === "files"
      ? {
          label: "Dosya ekle",
          options: [
            { label: "Dosya yükle", onClick: () => filesRef.current?.openUpload() },
            { label: "Yeni dosya oluştur", onClick: () => filesRef.current?.openCreateNative() },
          ],
        }
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

  const reloadAll = () => {
    if (!id) return;
    api.get<Project>(`/projects/${id}`).then(setProject).catch(() => setProject(null));
    api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => setTasks([]));
  };

  useEffect(reloadAll, [id]);
  // Geri/ileri alma sunucu durumunu değiştirir (ör. silinen görev geri gelir);
  // sayfa kendini tazelemeli, yoksa ancak yenileyince görünür.
  useRefreshOnUndo(reloadAll);

  // Tarayıcı sekmesinin başlığında proje adı yazsın.
  useEffect(() => {
    if (project?.title) document.title = `${project.title} · Projelio`;
    return () => {
      document.title = "Projelio";
    };
  }, [project?.title]);

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

  // İş ekibi sekmesinden bir göreve tıklanıp buraya yönlendirildiğinde, "Çıktılar"
  // sekmesine geçip ilgili görevi vurgulamak için location.state üzerinden gelen
  // hedefi okuyoruz. location.key her navigasyonda değiştiği için aynı göreve
  // tekrar tıklanırsa da yeniden tetiklenir.
  useEffect(() => {
    const targetId = (location.state as { highlightTaskId?: string } | null)?.highlightTaskId;
    if (!targetId) return;
    setActiveTab("tasks");
    setHighlightTaskId(targetId);
    // Hedef bir kez tüketildikten sonra history state'ini temizle: aksi halde sayfa
    // yenilenince ya da başka bir işlem sonrası aynı hedefe tekrar "ışınlanma" oluyordu.
    window.history.replaceState({}, "");
    // Parlama animasyonu bittikten sonra vurgusunu kaldır ki kalıcı kalmasın.
    const timer = setTimeout(() => setHighlightTaskId(undefined), 3500);
    return () => clearTimeout(timer);
  }, [location.key]);

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

  // Çoğaltılan görevler bu projeye eklenir; taşınanlar (başka bir proje/departmana
  // gittiği için) bu projenin görünümünden kalkar (bkz. TaskSelectionBar/MoveTaskModal).
  const handleTasksDuplicated = (created: Task[]) => {
    setTasks((prev) => [...prev, ...created]);
  };

  const handleTasksMoved = (moved: Task[]) => {
    const movedIds = new Set(moved.map((t) => t.id));
    setTasks((prev) => prev.filter((t) => !movedIds.has(t.id)));
  };

  // Toplu arşivleme/silme (bkz. TaskSelectionBar) yalnızca kullanıcının doğrudan
  // seçtiği üst seviye id'leri döndürür — alt görevler sunucuda kendiliğinden
  // kapsandığı için burada da `removeTaskFromState` ile aynı mantıkla (id VEYA
  // parentTaskId eşleşiyorsa) listeden düşürülürler.
  const removeTasksFromState = (ids: string[]) => {
    const idSet = new Set(ids);
    setTasks((prev) => prev.filter((t) => !idSet.has(t.id) && !(t.parentTaskId && idSet.has(t.parentTaskId))));
  };

  // Görev/alt görev oluşturmayı Cmd/Ctrl+Z ile geri alınabilir yapar: "run" az
  // önce oluşan kaydı siler, "redo" aynı bilgilerle yeniden oluşturur. Redo her
  // seferinde YENİ bir id ürettiği için (silinen kayıt kalıcı gitti), bir sonraki
  // undo'nun doğru id'yi silebilmesi için bu id'yi bir kapanış değişkeninde
  // güncel tutuyoruz.
  const registerTaskCreateUndo = (createdId: string, payload: Record<string, unknown>) => {
    let currentId = createdId;
    pushUndo({
      label: "Görev oluşturma",
      run: async () => {
        await api.delete(`/tasks/${currentId}`);
        reloadTasks();
      },
      redo: async () => {
        const recreated = await api.post<Task>(`/projects/${id}/tasks`, payload);
        currentId = recreated.id;
        reloadTasks();
      },
    });
  };

  const handleCreateTask = async (
    status: TaskStatus,
    title: string,
    options?: { weekNumber?: number; deadline?: string; startDate?: string; outputId?: string }
  ) => {
    if (!id) return;
    const deadline = options?.deadline ?? project?.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const payload = {
      title,
      status,
      deadline,
      startDate: options?.startDate,
      weekNumber: options?.weekNumber,
      outputId: options?.outputId,
    };
    try {
      const created = await api.post<Task>(`/projects/${id}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    if (!id) return;
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) return;
    const payload = { title, status: parent.status, deadline: parent.deadline, parentTaskId };
    try {
      const created = await api.post<Task>(`/projects/${id}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // alt görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const reloadTasks = () => {
    if (id) api.get<Task[]>(`/projects/${id}/tasks`).then(setTasks).catch(() => {});
  };

  const handleMoveTask = (taskId: string, status: TaskStatus, registerUndo = true) => {
    const previousStatus = tasksRef.current.find((t) => t.id === taskId)?.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    api.patch(`/tasks/${taskId}/status`, { status }).catch(reloadTasks);
    // registerUndo=false: bu çağrı başka bir işlemin yan etkisi (örn. üst görev
    // tamamlanınca alt görevlerin de kapanması) — yığında ayrı adım olmamalı.
    if (registerUndo && previousStatus && previousStatus !== status) {
      pushUndo({
        label: "Görev durumu",
        run: async () => {
          await api.patch(`/tasks/${taskId}/status`, { status: previousStatus });
          reloadTasks();
        },
        redo: async () => {
          await api.patch(`/tasks/${taskId}/status`, { status });
          reloadTasks();
        },
      });
    }
  };

  const handleReorderTasks = (ids: string[]) => {
    if (!ids.length) return;
    // Geri alma için yalnızca bu sürüklemeden etkilenen görevlerin eski sırası.
    const affectedIds = new Set(ids);
    const previousIds = tasksRef.current.filter((t) => affectedIds.has(t.id)).map((t) => t.id);
    setTasks((prev) => {
      const order = new Map(ids.map((taskId, index) => [taskId, index]));
      const affected = prev.filter((t) => order.has(t.id));
      const untouched = prev.filter((t) => !order.has(t.id));
      affected.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      return [...untouched, ...affected];
    });
    api.patch("/tasks/reorder", { ids }).catch(reloadTasks);
    registerReorderUndo("/tasks/reorder", previousIds, ids, reloadTasks);
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
          // Yan etki: geri alma yığınında ayrı bir adım olmasın.
          handleMoveTask(parent.id, "in_progress", false);
        }
      }
    } else {
      previousStatusRef.current[taskId] = task.status;
      handleMoveTask(taskId, "completed");
      tasks
        .filter((t) => t.parentTaskId === taskId && t.status !== "completed")
        .forEach((sub) => {
          previousStatusRef.current[sub.id] = sub.status;
          handleMoveTask(sub.id, "completed", false);
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

  // Kaydırınca tepede beliren sabit başlık için (bkz. App.tsx / lib/pageHeader).
  const coverRef = useRef<HTMLDivElement>(null);
  usePageHeader(project?.title, coverRef, [project?.title]);
  const isDesktop = useIsDesktop();
  // Kaydırılınca sabit başlığın en üst (normalde boş) bandında da sekmeler
  // görünsün diye (bkz. lib/pageHeader usePageHeaderTabs, App.tsx) — aksi
  // halde o bant boş/beyaz kalıyor, sekmelere geri dönmek için yukarı kadar
  // kaydırmak gerekiyordu. Yalnızca masaüstünde: dar ekranda sayfanın kendi
  // sekme çubuğu zaten normal akışta sabit kalıyor.
  usePageHeaderTabs(
    isDesktop ? <ProjectTabs active={activeTab} onChange={setActiveTab} style={{ marginBottom: 0 }} /> : null,
    [activeTab, isDesktop]
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background }}>
      {!project && (
        <div style={{ padding: 28 }}>
          <Link to="/" style={{ fontSize: 15, color: c.textSecondary, marginBottom: 4, display: "inline-block" }}>
            ← Projeler
          </Link>
        </div>
      )}

      {project && (() => {
        const hasCover = Boolean(project.coverImageUrl);
        return (
          <div
            ref={coverRef}
            style={{
              position: "relative",
              background: hasCover
                ? `linear-gradient(rgba(255,255,255,0.35), rgba(255,255,255,0.92)), center/cover url(${project.coverImageUrl})`
                : c.surface,
              borderBottom: hasCover ? "none" : `1px solid ${c.border}`,
              padding: hasCover ? "20px 28px" : "18px 28px",
              minHeight: hasCover ? 330 : undefined,
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
                Ücret: <span style={{ color: c.accentDark, fontWeight: 500 }}>{project.totalBudget.toLocaleString("tr-TR")} ₺</span>
              </span>
              <span>Başlangıç: {new Date(project.startDate).toLocaleDateString("tr-TR")}</span>
              <span>Bitiş: {new Date(project.deadline).toLocaleDateString("tr-TR")}</span>
            </div>

            {/* Düzenleme yalnızca proje sahibine görünür; sunucu tarafı da ayrıca yetki kontrolü yapar. */}
            {(!currentUserId || currentUserId === project.ownerId) && (
            <button
              onClick={() => setEditing(true)}
              aria-label="Projeyi düzenle"
              style={{
                position: "absolute",
                bottom: 16,
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
            )}
          </div>
        );
      })()}

      {project && id && (
        <div style={{ padding: "0 28px 28px" }}>
          {/* Sayfa kaydırılsa da sekmeler (akış, ekip, çıktılar, bütçe, süreç) ve
              geri bağlantısı üstte sabit kalır. */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: c.background,
              margin: "0 -28px",
              padding: "10px 28px 8px",
            }}
          >
            <Link
              to={`/jobs/${project.jobId}`}
              style={{ fontSize: 14, color: c.textSecondary, display: "inline-block", marginBottom: 6 }}
            >
              ← Projeler
            </Link>
            <ProjectTabs active={activeTab} onChange={setActiveTab} />
          </div>

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
              onTaskRenamed={updateTask}
              onReorderTasks={handleReorderTasks}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
              highlightTaskId={highlightTaskId}
              onTasksDuplicated={handleTasksDuplicated}
              onTasksMoved={handleTasksMoved}
              onTasksArchived={removeTasksFromState}
              onTasksDeleted={removeTasksFromState}
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
          {activeTab === "files" && <FilesPanel ref={filesRef} projectId={id} />}
          {activeTab === "process" && (
            <ProcessPanel
              project={project}
              tasks={tasks}
              onCreateTask={handleCreateTask}
              onCreateSubtask={handleCreateSubtask}
              onMoveTask={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTaskRenamed={updateTask}
              nav={processNav}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
              onTasksDuplicated={handleTasksDuplicated}
              onTasksMoved={handleTasksMoved}
              onTasksArchived={removeTasksFromState}
              onTasksDeleted={removeTasksFromState}
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
