import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Task, TaskStatus, User } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import TaskColumn, { TaskColumnHandle } from "./TaskColumn";
import TaskEditModal from "./TaskEditModal";
import TaskSelectionBar from "./TaskSelectionBar";
import TaskSortMenu from "./TaskSortMenu";
import MoveTaskModal from "./MoveTaskModal";
import ConfirmDialog from "./ConfirmDialog";
import Modal from "./Modal";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useTaskSelection } from "../lib/useTaskSelection";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useUndo } from "../lib/undo";

export interface DepartmentTasksPanelHandle {
  openCreate: () => void;
}

interface Props {
  departmentId: string;
}

const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

// Departmanın "Görevler" sekmesi: "Çıktılar" ara katmanı OLMADAN doğrudan
// kanban (görev/alt görev) tahtası — bir departmanın günlük işleri proje
// çıktısı gibi gruplanmaya ihtiyaç duymuyor, doğrudan iş listesi yeterli.
// FAB (üst sayfada — DepartmentDetail — merkezi olarak kayıt edilir) burada
// "Görev ekle" yerine "Yapılacak" sütununun hızlı ekleme kutusunu açar.
const DepartmentTasksPanel = forwardRef<DepartmentTasksPanelHandle, Props>(function DepartmentTasksPanel(
  { departmentId },
  ref
) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const columnRefs = useRef<Partial<Record<TaskStatus, TaskColumnHandle | null>>>({});
  const selection = useTaskSelection();
  const [sort, setSort] = useState<TaskSortMode>("manual");
  const [duplicating, setDuplicating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);
  const [confirmingBulkAction, setConfirmingBulkAction] = useState<"archive" | "delete" | null>(null);
  const { pushUndo, pushDestructive } = useUndo();
  const registerReorderUndo = useReorderUndo();
  const tasksRef = useLatestRef(tasks);
  // "Üzerinde çalışıyorum" işareti — diğer kanbanlarla aynı kaynak
  // (users.active_task_id, bkz. ProjectDetail/JobDetail/TasksOverview).
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    openCreate: () => columnRefs.current.todo?.openCreate(),
  }));

  useEffect(() => {
    api
      .get<User | null>("/auth/me")
      .then((user) => setActiveTaskId(user?.activeTaskId))
      .catch(() => setActiveTaskId(undefined));
  }, []);

  // Diğer panellerle aynı davranış: aynı göreve tekrar basmak işareti kaldırır.
  const handleToggleActive = (taskId: string) => {
    const turningOn = activeTaskId !== taskId;
    setActiveTaskId(turningOn ? taskId : undefined);
    api.patch(`/tasks/${taskId}/active-worker`, { active: turningOn }).catch(() => {
      setActiveTaskId((prev) => (turningOn ? undefined : prev));
    });
  };

  const load = () => {
    setLoading(true);
    api
      .get<Task[]>(`/departments/${departmentId}/tasks`)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };
  useEffect(load, [departmentId]);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(load);

  const updateTask = (updated: Task) => {
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const removeTaskFromState = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId && t.parentTaskId !== taskId));
  };

  // Toplu arşivleme/silme yalnızca kullanıcının doğrudan seçtiği üst seviye
  // id'leri döndürür — alt görevler sunucuda kendiliğinden kapsandığı için
  // burada da `removeTaskFromState` ile aynı mantıkla listeden düşürülürler.
  const removeTasksFromState = (ids: string[]) => {
    const idSet = new Set(ids);
    setTasks((prev) => prev.filter((t) => !idSet.has(t.id) && !(t.parentTaskId && idSet.has(t.parentTaskId))));
  };

  // Görev/alt görev oluşturmayı Cmd/Ctrl+Z ile geri alınabilir yapar (bkz.
  // ProjectDetail.tsx registerTaskCreateUndo — aynı desen).
  const registerTaskCreateUndo = (createdId: string, payload: Record<string, unknown>) => {
    let currentId = createdId;
    pushUndo({
      label: "Görev oluşturma",
      run: async () => {
        await api.delete(`/tasks/${currentId}`);
        load();
      },
      redo: async () => {
        const recreated = await api.post<Task>(`/departments/${departmentId}/tasks`, payload);
        currentId = recreated.id;
        load();
      },
    });
  };

  const handleCreateTask = async (status: TaskStatus, title: string) => {
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const payload = { title, status, deadline };
    try {
      const created = await api.post<Task>(`/departments/${departmentId}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    const parent = tasks.find((t) => t.id === parentTaskId);
    if (!parent) return;
    const payload = { title, status: parent.status, deadline: parent.deadline, parentTaskId };
    try {
      const created = await api.post<Task>(`/departments/${departmentId}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // alt görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleMoveTask = (taskId: string, status: TaskStatus, registerUndo = true) => {
    const previousStatus = tasksRef.current.find((t) => t.id === taskId)?.status;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    api.patch(`/tasks/${taskId}/status`, { status }).catch(() => load());
    // registerUndo=false: bu çağrı zaten bir geri alma işleminin kendisi ya da
    // başka bir işlemin yan etkisi (örn. üst görev tamamlanınca alt görevler).
    if (registerUndo && previousStatus && previousStatus !== status) {
      pushUndo({
        label: "Görev durumu",
        run: async () => {
          await api.patch(`/tasks/${taskId}/status`, { status: previousStatus });
          load();
        },
        redo: async () => {
          await api.patch(`/tasks/${taskId}/status`, { status });
          load();
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
    api.patch("/tasks/reorder", { ids }).catch(() => load());
    registerReorderUndo("/tasks/reorder", previousIds, ids, load);
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

  const handleDuplicateSelected = async () => {
    if (selection.selectedIds.size === 0) return;
    setDuplicating(true);
    try {
      const created = await api.post<Task[]>("/tasks/duplicate", { ids: Array.from(selection.selectedIds) });
      setTasks((prev) => [...prev, ...created]);
      selection.clear();
    } catch {
      // çoğaltılamadı, kullanıcı tekrar deneyebilir
    } finally {
      setDuplicating(false);
    }
  };

  // Seçili görevleri (ve üst seviye olanlarınsa alt görevlerini) toplu arşivler.
  // ConfirmDialog'un onConfirm'ü olarak kullanılır — hata fırlatırsa modal açık
  // kalıp hata mesajı gösterir, o yüzden hatayı yutmuyoruz.
  const handleArchiveSelected = async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    setArchiving(true);
    try {
      await api.patch<Task[]>("/tasks/bulk-archive", { ids });
      removeTasksFromState(ids);
      // Arşivleme geri alınabilir: her görev zaten tekil /restore uç noktasına
      // sahip ve o uç nokta alt görevleri de kendiliğinden geri getiriyor.
      pushUndo({
        label: `${ids.length} görev arşivleme`,
        run: async () => {
          await Promise.all(ids.map((id) => api.patch(`/tasks/${id}/restore`, {})));
          load();
        },
        redo: async () => {
          await api.patch("/tasks/bulk-archive", { ids });
          removeTasksFromState(ids);
        },
      });
      selection.clear();
      setConfirmingBulkAction(null);
    } finally {
      setArchiving(false);
    }
  };

  // Seçili görevleri (ve alt görevlerini) toplu siler. Kalıcı silme sunucuda
  // geri alınamadığı için hemen yapılmaz: arayüzden hemen kaldırılır ama gerçek
  // istek birkaç saniye ertelenir (bkz. lib/undo pushDestructive) — bu pencerede
  // Cmd/Ctrl+Z ile iptal edilebilir.
  const handleDeleteSelected = () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    removeTasksFromState(ids);
    pushDestructive({
      label: `${ids.length} görev silme`,
      commit: () => api.post("/tasks/bulk-delete", { ids }),
      restore: () => load(),
      entityIds: ids,
    });
    selection.clear();
    setConfirmingBulkAction(null);
  };

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>;

  return (
    <div>

      {/* Tek satırlık araç çubuğu: sağda sıralama ve seçim. Seçim modu
          açıldığında bar tam genişlik alıp alta kayar. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ marginLeft: "auto" }}>
          <TaskSortMenu value={sort} onChange={setSort} />
        </div>
        <TaskSelectionBar
          inline
          selectionMode={selection.selectionMode}
          selectedCount={selection.selectedIds.size}
          busy={duplicating || archiving}
          onEnable={selection.toggleSelectionMode}
          onCancel={selection.clear}
          onDuplicate={handleDuplicateSelected}
          onMove={() => setMovingOpen(true)}
          onArchive={() => setConfirmingBulkAction("archive")}
          onDelete={() => setConfirmingBulkAction("delete")}
        />
      </div>

      {/* Masaüstünde üç sütun (Devam eden/Yapılacak/Tamamlandı) yan yana, dar ekranda
          (mobil) alt alta — bkz. useIsDesktop. */}
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
              ref={(el) => {
                columnRefs.current[status] = el;
              }}
              status={status}
              allTasks={sortTasks(tasks, sort)}
              onCreate={handleCreateTask}
              onCreateSubtask={handleCreateSubtask}
              onMove={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTaskRenamed={updateTask}
              // Başka bir ölçütle sıralıyken sürükleyip sıra değiştirmek anlamsız:
              // kart bırakıldığı yerde durmaz, ölçüte göre geri sıçrar.
              onReorderTasks={sort === "manual" ? handleReorderTasks : undefined}
              group={`dept-tasks-${departmentId}`}
              selectionMode={selection.selectionMode}
              selectedIds={selection.selectedIds}
              onToggleSelect={selection.toggleSelect}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
            />
          </div>
        ))}
      </div>

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

      {movingOpen && (
        <MoveTaskModal
          taskIds={Array.from(selection.selectedIds)}
          onClose={() => setMovingOpen(false)}
          onMoved={() => {
            selection.clear();
            load();
          }}
        />
      )}

      {confirmingBulkAction === "archive" && (
        <ConfirmDialog
          title="Görevleri arşivle"
          message={`${selection.selectedIds.size} görevi (varsa alt görevleriyle birlikte) arşive taşımak istediğine emin misin? Arşivlenen görevler bu listeden kalkar, arşivden geri getirilebilir.`}
          confirmLabel="Arşivle"
          danger={false}
          onCancel={() => setConfirmingBulkAction(null)}
          onConfirm={handleArchiveSelected}
        />
      )}
      {confirmingBulkAction === "delete" && (
        <ConfirmDialog
          title="Görevleri sil"
          message={`${selection.selectedIds.size} görevi (varsa alt görevleriyle birlikte) silmek istediğine emin misin? Silindikten sonra birkaç saniye içinde Cmd/Ctrl+Z ile geri alabilirsin, sonrasında kalıcı olarak silinir.`}
          confirmLabel="Sil"
          danger
          onCancel={() => setConfirmingBulkAction(null)}
          onConfirm={handleDeleteSelected}
        />
      )}
    </div>
  );
});

export default DepartmentTasksPanel;
