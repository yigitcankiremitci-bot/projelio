import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Task, TaskStatus, User } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import TaskColumn from "./TaskColumn";
import TaskEditModal from "./TaskEditModal";
import TaskSortMenu from "./TaskSortMenu";
import Modal from "./Modal";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useLatestRef, useRefreshOnUndo, useUndo } from "../lib/undo";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";
import { backState } from "../lib/backTarget";
import { useDragScroll } from "../lib/useDragScroll";
import { useT } from "../lib/i18n";
import { gorevDurumHatasiniBildir } from "../lib/taskBlockNotice";

// Sıra, uygulamadaki diğer tüm kanbanlarla aynı: önce üzerinde çalışılan işler.
// (bkz. DepartmentTasksPanel, JobTasksPanel, TasksOverview)
const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

interface Props {
  organizationId: string;
  /** Geri bağlantısında yazacak ad: kullanıcı buraya döneceğini görsün. */
  organizationName?: string;
}

/**
 * Şirket sayfasının "Görevler" sekmesi: organizasyona bağlı TÜM departmanların
 * görevleri tek panoda.
 *
 * NEDEN VAR: departman sayısı arttıkça "bu hafta şirkette ne dönüyor" sorusunun
 * cevabı departman departman gezmeye dönüşüyordu. Görevlerin kendisi yine
 * departmanlarında yaşıyor; burası yalnızca birleştirilmiş bir görünüm, o yüzden
 * her kartın altında geldiği departmanın adı yazıyor.
 *
 * İKİ BİLİNÇLİ EKSİK:
 *
 *  - ÜST DÜZEY görev EKLEME yok. Yeni görev bir departmana ait olmak zorunda ve
 *    bu panoda "hangi departman" sorusunun cevabı yok; sütun altındaki hızlı
 *    ekleme kutusu burada kartı sessizce yanlış yere koyardı. Ekleme departman
 *    sayfasında — karta çift tıklamak oraya götürür.
 *
 *    ALT görev bunun istisnası: departmanı belirsiz değil, üst görevinkinden
 *    geliyor. Eskiden alt görev katmanı bu panoda tamamen KAPALIYDI (TaskColumn
 *    onu yalnızca onCreateSubtask verilince çiziyor), yani kullanıcı şirket
 *    görünümünde alt görevleri hiç göremiyordu.
 *  - Elle SIRALAMA yok. sort_order departman panosunun kendi sırası; burada
 *    departmanları karıştırarak sürüklemek o sıraları bozardı (JobTasksPanel'de
 *    aynı gerekçeyle kapalı). Sıralama ölçütleri (tarih, öncelik…) çalışıyor.
 */
export default function OrgTasksPanel({ organizationId, organizationName }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  // Pano yalnızca masaüstünde yana kayıyor; dar ekranda sütunlar alt alta.
  const boardScrollRef = useDragScroll<HTMLDivElement>(isDesktop);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [parentCompletePrompt, setParentCompletePrompt] = useState<Task | null>(null);
  const [sort, setSort] = useState<TaskSortMode>("manual");
  // Bir kart "Tamamlandı"dan geri alındığında hangi kolona döneceği.
  const previousStatusRef = useRef<Record<string, TaskStatus>>({});
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>(undefined);
  const { pushUndo } = useUndo();
  const tasksRef = useLatestRef(tasks);

  // "Yükleniyor…" yalnızca ilk yüklemede: bu fonksiyon `onTasksReload` olarak da
  // çağrılıyor ve her sürükle-bırak sonrası panoyu yükleme yazısına çevirmesi
  // "sayfa yenilendi" hissi veriyordu (bkz. DepartmentTasksPanel'deki aynı not).
  const load = () => {
    api
      .get<Task[]>(`/organizations/${organizationId}/tasks`)
      .then(setTasks)
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  };
  // Başka bir şirkete geçildiğinde yükleme yazısı yeniden gösterilir
  // (bkz. DepartmentTasksPanel'deki aynı not).
  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(load);

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

  const updateTask = (updated: Task) => {
    // departmentName yalnızca bu uçtan geliyor (bkz. tasks.service
    // findByOrganization); tekil görev yanıtı onu taşımadığı için eldeki değer
    // korunuyor, yoksa kaydedilen kartın departman satırı kayboluyordu.
    setTasks((prev) =>
      prev.map((task) =>
        task.id === updated.id ? { departmentName: task.departmentName, ...updated } : task
      )
    );
  };

  const removeTaskFromState = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId && task.parentTaskId !== taskId));
  };

  /**
   * Alt görev ekleme. Departman panosundakiyle aynı uç kullanılıyor; departman
   * kimliği ÜST GÖREVDEN okunuyor — bu panoda "hangi departman" sorusunun başka
   * bir cevabı yok, alt görev üstünün yanında yaşamak zorunda.
   */
  const handleCreateSubtask = async (parentTaskId: string, title: string) => {
    const parent = tasksRef.current.find((task) => task.id === parentTaskId);
    if (!parent?.departmentId) return;
    try {
      const created = await api.post<Task>(`/departments/${parent.departmentId}/tasks`, {
        title,
        status: parent.status,
        deadline: parent.deadline,
        parentTaskId,
      });
      // departmentName tekil yanıtta gelmiyor (bkz. updateTask'taki aynı not);
      // üst görevinkini veriyoruz, alt görev zaten onun departmanında.
      setTasks((prev) => [...prev, { departmentName: parent.departmentName, ...created }]);
    } catch {
      // alt görev oluşturulamadı, kullanıcı tekrar deneyebilir
    }
  };

  const handleMoveTask = (taskId: string, status: TaskStatus, registerUndo = true) => {
    const previousStatus = tasksRef.current.find((task) => task.id === taskId)?.status;
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, status } : task)));
    api.patch(`/tasks/${taskId}/status`, { status }).catch((err) => {
      gorevDurumHatasiniBildir(err);
      load();
    });
    // registerUndo=false: bu çağrı zaten bir geri alma işleminin kendisi ya da
    // başka bir işlemin yan etkisi (örn. üst görev tamamlanınca alt görevler).
    if (registerUndo && previousStatus && previousStatus !== status) {
      pushUndo({
        label: t("Görev durumu"),
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

  // Departman panosundaki davranışın birebir aynısı: alt görevler üst görevle
  // birlikte kapanır, hepsi kapandığında üst görev için onay sorulur.
  const handleToggleComplete = (taskId: string) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;
    if (task.status === "completed") {
      const previous = previousStatusRef.current[taskId] ?? "todo";
      delete previousStatusRef.current[taskId];
      handleMoveTask(taskId, previous);

      if (task.parentTaskId) {
        const parent = tasks.find((item) => item.id === task.parentTaskId);
        // Yan etki: geri alma yığınında ayrı bir adım olmasın.
        if (parent && parent.status === "completed") handleMoveTask(parent.id, "in_progress", false);
      }
      return;
    }

    previousStatusRef.current[taskId] = task.status;
    handleMoveTask(taskId, "completed");
    tasks
      .filter((item) => item.parentTaskId === taskId && item.status !== "completed")
      .forEach((sub) => {
        previousStatusRef.current[sub.id] = sub.status;
        handleMoveTask(sub.id, "completed", false);
      });

    if (task.parentTaskId) {
      const parent = tasks.find((item) => item.id === task.parentTaskId);
      if (parent && parent.status !== "completed") {
        const siblings = tasks.filter((item) => item.parentTaskId === parent.id);
        const allDone = siblings.every((sib) => sib.id === taskId || sib.status === "completed");
        if (allDone) setParentCompletePrompt(parent);
      }
    }
  };

  /**
   * Çift tıklama: görevin yaşadığı departman sayfasına gidip kartı parlatır
   * (bkz. TasksOverview.openTaskSource — aynı desen). Geri bağlantısı adresi
   * yanında taşıyor ki kullanıcı bu sekmeye geri dönebilsin.
   */
  const openTaskSource = (task: Task) => {
    if (!task.departmentId) return;
    navigate(`/departments/${task.departmentId}?tab=tasks`, {
      state: {
        highlightTaskId: task.id,
        ...backState({
          to: `/organizations/${organizationId}?tab=tasks`,
          label: organizationName || t("Görevler"),
        }),
      },
    });
  };

  // Kart altındaki küçük satır: bu görev hangi departmandan geldi.
  const getTaskMeta = (task: Task): string | undefined => {
    if (task.departmentName) return task.departmentName;
    // Alt görevler sunucudan üst görevle aynı departmanla geliyor; yine de
    // eksikse üstünden okunuyor — kartın kaynağı hiç boş kalmasın.
    if (!task.parentTaskId) return undefined;
    return tasks.find((item) => item.id === task.parentTaskId)?.departmentName;
  };

  if (loading) return <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>;

  if (tasks.length === 0) {
    return (
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
        {t("Departmanlarda henüz görev yok. Görevler departman sayfalarından eklenir.")}
      </div>
    );
  }

  return (
    <div>
      {/* Tek satırlık araç çubuğu: sağda sıralama — departman panosuyla aynı düzen. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ marginLeft: "auto" }}>
          <TaskSortMenu value={sort} onChange={setSort} />
        </div>
      </div>

      {/* Masaüstünde üç sütun yan yana, dar ekranda alt alta — bkz. useIsDesktop. */}
      <div
        ref={boardScrollRef}
        style={{
          display: "flex",
          flexDirection: isDesktop ? "row" : "column",
          alignItems: isDesktop ? "flex-start" : undefined,
          gap: 14,
          overflowX: isDesktop ? "auto" : undefined,
        }}
      >
        {columns.map((status) => (
          <div key={status} style={isDesktop ? { flex: "1 1 260px", minWidth: 260 } : { width: "100%" }}>
            <TaskColumn
              status={status}
              allTasks={sortTasks(tasks, sort)}
              onCreateSubtask={handleCreateSubtask}
              onTasksReload={load}
              onMove={handleMoveTask}
              onToggleComplete={handleToggleComplete}
              onEditTask={setEditingTask}
              onTaskRenamed={updateTask}
              getTaskMeta={getTaskMeta}
              onOpenSource={openTaskSource}
              group={`org-tasks-${organizationId}`}
              activeTaskId={activeTaskId}
              onToggleActive={handleToggleActive}
            />
          </div>
        ))}
      </div>

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
}
