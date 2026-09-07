import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Task, TaskStatus, User } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import OutputsPanel, { OutputsPanelHandle } from "./OutputsPanel";
import TaskEditModal from "./TaskEditModal";
import Modal from "./Modal";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useUndo } from "../lib/undo";
import { useT } from "../lib/i18n";
import { gorevDurumHatasiniBildir } from "../lib/taskBlockNotice";

export interface DepartmentTasksPanelHandle {
  /** "Görevler" görünümünde "Yapılacak" sütununun hızlı ekleme kutusunu açar. */
  openCreate: () => void;
  /** "Çıktılar" görünümüne geçip yeni çıktı modalını açar. */
  openCreateOutput: () => void;
}

interface Props {
  departmentId: string;
}

/**
 * Departmanın "Görevler" sekmesi.
 *
 * ÇIKTI KATMANI: eskiden bu panoda YOKTU — "bir departmanın günlük işleri proje
 * çıktısı gibi gruplanmaya ihtiyaç duymuyor" varsayımıyla doğrudan kanban
 * çiziliyordu. Varsayım tutmadı: departmanlar da teslim edilebilir parçalar
 * (kampanya, rapor, tasarım seti) üretiyor ve kullanıcı bunları gruplayacak yer
 * arıyordu. Sunucu tarafı zaten hazırdı (outputs.department_id + /departments/
 * :id/outputs uçları), eksik olan yalnızca arayüzdü.
 *
 * Bu yüzden pano artık projeninkiyle AYNI bileşeni (OutputsPanel) kullanıyor:
 * Görevler/Çıktılar geçişi, sıralama, çoklu seçim, toplu çoğaltma/taşıma/
 * arşivleme/silme ve kaydırınca sabit şeritte beliren araç çubuğu oradan geliyor.
 * Burada kalan tek iş verinin sahipliği — ProjectDetail'in oynadığı rolün aynısı.
 */
const DepartmentTasksPanel = forwardRef<DepartmentTasksPanelHandle, Props>(function DepartmentTasksPanel(
  { departmentId },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const outputsRef = useRef<OutputsPanelHandle>(null);
  const { pushUndo } = useUndo();
  const registerReorderUndo = useReorderUndo();
  const tasksRef = useLatestRef(tasks);
  // "Üzerinde çalışıyorum" işareti — diğer kanbanlarla aynı kaynak
  // (users.active_task_id, bkz. ProjectDetail/JobDetail/TasksOverview).
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);

  useImperativeHandle(ref, () => ({
    openCreate: () => outputsRef.current?.openCreateTask(),
    openCreateOutput: () => outputsRef.current?.openCreateOutput(),
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

  /**
   * Görevleri sunucudan çeker.
   *
   * "Yükleniyor…" yalnızca İLK yüklemede gösteriliyor: bu fonksiyon aynı zamanda
   * `onTasksReload` olarak da kullanılıyor (alt görevi sütuna ya da başka bir
   * göreve sürükleyip bırakınca sıra numaraları sunucuda değiştiği için tazeleme
   * şart). Her tazelemede tüm pano bir anlığına yerini yükleme yazısına
   * bırakıyordu ve kullanıcı bunu "sayfa yenilendi" diye okuyordu — kaydırma
   * konumu da başa dönüyordu.
   */
  const load = () => {
    api
      .get<Task[]>(`/departments/${departmentId}/tasks`)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };
  // Başka bir departmana geçildiğinde yükleme yazısı YENİDEN gösterilir:
  // bileşen aynı rotada kaldığı için unmount olmuyor ve eski departmanın
  // görevleri bir an ekranda kalıyordu.
  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);
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

  /**
   * Görev oluşturma. `options.outputId` çıktı görünümünden geliyor: görev o
   * çıktının altına açılıyor (bkz. OutputsPanel). Diğer alanlar da aynı yerden
   * geçiyor, ProjectDetail'deki imzanın aynısı.
   */
  const handleCreateTask = async (
    status: TaskStatus,
    title: string,
    options?: { weekNumber?: number; deadline?: string; startDate?: string; outputId?: string }
  ) => {
    const payload = {
      title,
      status,
      deadline: options?.deadline ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      ...(options?.startDate ? { startDate: options.startDate } : {}),
      ...(options?.weekNumber !== undefined ? { weekNumber: options.weekNumber } : {}),
      ...(options?.outputId ? { outputId: options.outputId } : {}),
    };
    try {
      const created = await api.post<Task>(`/departments/${departmentId}/tasks`, payload);
      setTasks((prev) => [...prev, created]);
      registerTaskCreateUndo(created.id, payload);
    } catch {
      // görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    const parent = tasksRef.current.find((t) => t.id === parentTaskId);
    if (!parent) return;
    // Alt görev üstünün çıktısında kalmalı: aksi halde çıktı görünümünde
    // üst görev bir yerde, alt görevi başka bir yerde görünür.
    const payload = {
      title,
      status: parent.status,
      deadline: parent.deadline,
      parentTaskId,
      ...(parent.outputId ? { outputId: parent.outputId } : {}),
    };
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
    api.patch(`/tasks/${taskId}/status`, { status }).catch((err) => {
      gorevDurumHatasiniBildir(err);
      load();
    });
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
    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === "completed") {
      const previous = previousStatusRef.current[taskId] ?? "todo";
      delete previousStatusRef.current[taskId];
      handleMoveTask(taskId, previous);

      if (task.parentTaskId) {
        const parent = tasksRef.current.find((p) => p.id === task.parentTaskId);
        if (parent && parent.status === "completed") {
          // Yan etki: geri alma yığınında ayrı bir adım olmasın.
          handleMoveTask(parent.id, "in_progress", false);
        }
      }
    } else {
      previousStatusRef.current[taskId] = task.status;
      handleMoveTask(taskId, "completed");
      tasksRef.current
        .filter((t) => t.parentTaskId === taskId && t.status !== "completed")
        .forEach((sub) => {
          previousStatusRef.current[sub.id] = sub.status;
          handleMoveTask(sub.id, "completed", false);
        });

      if (task.parentTaskId) {
        const parent = tasksRef.current.find((p) => p.id === task.parentTaskId);
        if (parent && parent.status !== "completed") {
          const siblings = tasksRef.current.filter((t) => t.parentTaskId === parent.id);
          const allDone = siblings.every((s) => s.id === taskId || s.status === "completed");
          if (allDone) setParentCompletePrompt(parent);
        }
      }
    }
  };

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  return (
    <div>
      <OutputsPanel
        ref={outputsRef}
        departmentId={departmentId}
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
        onTasksDuplicated={(created) => setTasks((prev) => [...prev, ...created])}
        // Taşınan görevler başka bir kapsama gittiyse bu listeden düşer.
        onTasksMoved={(moved) => {
          const movedIds = new Set(moved.map((task) => task.id));
          setTasks((prev) => prev.filter((task) => !movedIds.has(task.id)));
        }}
        onTasksArchived={removeTasksFromState}
        onTasksDeleted={removeTasksFromState}
        onTasksReload={load}
      />

      {parentCompletePrompt && (
        <Modal title={t("Görevi tamamla")} onClose={() => setParentCompletePrompt(null)}>
          <p style={{ fontSize: 16, color: c.textSecondary, margin: "0 0 18px", lineHeight: 1.5 }}>
            <strong style={{ color: c.textPrimary, fontWeight: 500 }}>{parentCompletePrompt.title}</strong> görevinin tüm alt
            görevleri tamamlandı. Bu görevi de tamamlandı olarak işaretlemek ister misin?
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setParentCompletePrompt(null)}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textPrimary, fontSize: 16 }}
            >
              {t("Hayır")}
            </button>
            <button
              data-primary
              onClick={() => {
                handleToggleComplete(parentCompletePrompt.id);
                setParentCompletePrompt(null);
              }}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 16, fontWeight: 500 }}
            >
              {t("Evet, tamamla")}
            </button>
          </div>
        </Modal>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          // Ek eklendiğinde modal kapanmadan kart güncellensin (rozet).
          onTaskPatched={updateTask}
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
});

export default DepartmentTasksPanel;
