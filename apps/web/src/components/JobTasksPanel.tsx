import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { Output, Project, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import TaskColumn from "./TaskColumn";
import TaskSortMenu from "./TaskSortMenu";
import CreateTaskModal from "./CreateTaskModal";
import TaskSelectionBar from "./TaskSelectionBar";
import MoveTaskModal from "./MoveTaskModal";
import BulkConvertHierarchyModal from "./BulkConvertHierarchyModal";
import ConfirmDialog from "./ConfirmDialog";
import { useIsDesktop } from "../lib/useIsDesktop";
import { IconChevronDown, IconChevronUp } from "./icons";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";
import { useTaskSelection } from "../lib/useTaskSelection";
import { selectedLioTasks } from "../lib/askLio";
import { useUndo } from "../lib/undo";
import { backState } from "../lib/backTarget";
import { focusParams, resolveTaskFocus, type FocusWhere, type TaskFocus } from "../lib/taskFocus";

const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

/**
 * Üç sütunlu pano varsayılan KAPALI: iş sayfasının İşler sekmesi açıldığında
 * ilk görülen şey bugünün işi olsun, 400 satırlık pano değil. Pano silinmedi —
 * projeye bağlı olmayan iş görevlerinin tek yaşadığı yer orası; kaldırılsaydı
 * o görevler hiçbir ekranda görünmezdi.
 *
 * Tercih cihazda tutuluyor (bkz. lib/homeTarget.ts, aynı desen).
 */
const BOARD_STORAGE_KEY = "projelio_job_board_open";

function readBoardOpen(): boolean {
  try {
    return localStorage.getItem(BOARD_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export interface JobTasksPanelHandle {
  openCreate: () => void;
}

interface Props {
  jobId: string;
  /** Geri bağlantısında yazacak ad: kullanıcı buraya döneceğini görsün. */
  jobTitle?: string;
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
  // Toplu arşivleme/silme sonrası üst bileşenin kendi `tasks` state'ini
  // güncelleyebilmesi için (bkz. ProjectDetail.tsx removeTasksFromState).
  onTasksArchived?: (ids: string[]) => void;
  onTasksDeleted?: (ids: string[]) => void;
}

const JobTasksPanel = forwardRef<JobTasksPanelHandle, Props>(function JobTasksPanel(
  {
    jobId,
    jobTitle,
    projects,
    tasks,
    onCreateSubtask,
    onMoveTask,
    onToggleComplete,
    onEditTask,
    onTaskRenamed,
    onTasksReload,
    activeTaskId,
    onToggleActive,
    onTasksArchived,
    onTasksDeleted,
  },
  ref
) {
  const c = useThemeColors();
  const isDesktop = useIsDesktop();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [boardOpen, setBoardOpen] = useState(readBoardOpen);
  // Bugün listesindeki kart için: kaydırmayı bir kez yap (bkz. TaskColumn'daki
  // aynı gerekçe — liste tazelendikçe sayfa yeniden zıplamasın).
  const todayListRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | undefined>(undefined);
  // Parlayacak kart: kimliği YETMEZ, hangi listedeki kopyası olduğu da lazım —
  // aynı görev hem bugün listesinde hem panoda duruyor olabilir
  // (bkz. lib/taskFocus.ts).
  const [focusTarget, setFocusTarget] = useState<TaskFocus | undefined>(undefined);
  // Tek tıklama görev kartını açıyor, çift tıklama kaynağa gidiyor. Tarayıcı
  // çift tıklamayı ancak ikinci tıklamadan sonra bildirdiği için tek tıklama
  // kısa süre geciktiriliyor: aksi halde çift tıklamada önce modal açılıp
  // hemen ardından sayfa değişiyor, ekran bir an "zıplıyordu".
  const clickTimer = useRef<number | null>(null);
  const { pushUndo, pushDestructive } = useUndo();
  const [creating, setCreating] = useState(false);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const selection = useTaskSelection();
  const [sort, setSort] = useState<TaskSortMode>("manual");
  const [duplicating, setDuplicating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);
  const [confirmingBulkAction, setConfirmingBulkAction] = useState<"archive" | "delete" | null>(null);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreating(true),
  }));

  /** Toplu seviye dönüştürme penceresi (bkz. BulkConvertHierarchyModal). */
  const [convertOpen, setConvertOpen] = useState(false);

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

  // Seçili görevleri (ve üst seviye olanlarınsa alt görevlerini) toplu arşivler.
  // ConfirmDialog'un onConfirm'ü olarak kullanılır — hata fırlatırsa modal açık
  // kalıp hata mesajı gösterir, o yüzden hatayı yutmuyoruz.
  const handleArchiveSelected = async () => {
    const ids = Array.from(selection.selectedIds);
    if (ids.length === 0) return;
    setArchiving(true);
    try {
      await api.patch<Task[]>("/tasks/bulk-archive", { ids });
      onTasksArchived?.(ids);
      // Arşivleme geri alınabilir: her görev zaten tekil /restore uç noktasına
      // sahip ve o uç nokta alt görevleri de kendiliğinden geri getiriyor.
      // Geri alma sonrası liste tazelemesini JobDetail.tsx'teki
      // useRefreshOnUndo(reload) üstlenir, burada tekrarlamaya gerek yok.
      pushUndo({
        label: `${ids.length} görev arşivleme`,
        run: async () => {
          await Promise.all(ids.map((id) => api.patch(`/tasks/${id}/restore`, {})));
        },
        redo: async () => {
          await api.patch("/tasks/bulk-archive", { ids });
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
    onTasksDeleted?.(ids);
    pushDestructive({
      label: `${ids.length} görev silme`,
      commit: () => api.post("/tasks/bulk-delete", { ids }),
      restore: () => {},
      entityIds: ids,
    });
    selection.clear();
    setConfirmingBulkAction(null);
  };

  // Görev oluşturmayı Cmd/Ctrl+Z ile geri alınabilir yapar (bkz. ProjectDetail.tsx
  // registerTaskCreateUndo — aynı desen). "run" az önce oluşan kaydı siler, "redo"
  // döndürülen görevin alanlarından yeniden oluşturur.
  const registerTaskCreateUndo = (task: Task) => {
    if (!task.projectId) return;
    let currentId = task.id;
    const payload = {
      title: task.title,
      status: task.status,
      deadline: task.deadline,
      outputId: task.outputId,
      assignedTo: task.assignedTo,
      estimatedDurationValue: task.estimatedDurationValue,
      estimatedDurationUnit: task.estimatedDurationUnit,
    };
    pushUndo({
      label: "Görev oluşturma",
      run: async () => {
        await api.delete(`/tasks/${currentId}`);
        onTasksReload();
      },
      redo: async () => {
        const recreated = await api.post<Task>(`/projects/${task.projectId}/tasks`, payload);
        currentId = recreated.id;
        onTasksReload();
      },
    });
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
  // Tercih efektte DEĞİL, düğmenin kendisinde yazılıyor: pano bir de "şu göreve
  // odaklan" isteğiyle programatik açılıyor (bkz. aşağıdaki focus efekti) ve
  // efekte bağlanırsa o geçici açılış kullanıcının kalıcı tercihini sessizce
  // değiştirirdi.
  const toggleBoard = () => {
    setBoardOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(BOARD_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Gizli sekmede yazım hata verebilir; tercih o oturumda hatırlanmaz.
      }
      return next;
    });
  };

  // Parlama tek seferlik: aynı göreve tekrar çift tıklandığında yeniden
  // tetiklenebilsin diye bir süre sonra temizleniyor.
  useEffect(() => {
    if (!focusTarget) return;
    const t = window.setTimeout(() => setFocusTarget(undefined), 2500);
    return () => window.clearTimeout(t);
  }, [focusTarget]);

  useEffect(() => () => {
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
  }, []);

  /**
   * Çift tıklama: görevin yaşadığı sayfaya gidip kartı parlatır — Yapılacaklar
   * sayfasındaki davranışın aynısı (bkz. TasksOverview.openTaskSource).
   *
   * Ne projeye ne departmana bağlı olan iş görevlerinin gidilecek bir sayfası
   * yok: onlar zaten BU panoda yaşıyor. O yüzden pano açılır ve kart yerinde
   * parlar — çift tıklama hiçbir görevde sessizce boşa gitmez.
   */
  const openTaskSource = (task: Task, where: FocusWhere) => {
    // Geri bağlantısı yalnızca sekmeye değil, ÇIKILAN KARTA dönsün diye
    // adresi yanımızda götürüyoruz (bkz. lib/backTarget.ts). `where` şart:
    // aynı görev iki listede birden olabiliyor, hangisine tıklandıysa ona
    // dönülmeli (bkz. lib/taskFocus.ts).
    const from = {
      to: `/jobs/${jobId}?tab=tasks&${focusParams(task.id, where)}`,
      label: jobTitle || "İşler",
    };
    if (task.projectId) {
      navigate(`/projects/${task.projectId}`, {
        state: { highlightTaskId: task.id, ...backState(from) },
      });
      return;
    }
    if (task.departmentId) {
      navigate(`/departments/${task.departmentId}?tab=tasks`, {
        state: { highlightTaskId: task.id, ...backState(from) },
      });
      return;
    }
    // Gidilecek sayfası olmayan iş görevi: sayfa değişmiyor, kart yerinde
    // parlıyor. Panodakine tıklandıysa panoyu açmak gerekiyor.
    if (where === "board") setBoardOpen(true);
    setFocusTarget({ id: task.id, where });
  };

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

  // Geri dönüşte "şu karta odaklan": adresten okunur, hemen adresten silinir
  // (yenilemede ya da ileri/geri gezinmede tekrar zıplamasın), hedef state'te
  // yaşamaya devam eder — kartlar sunucudan sonra düşse bile kaydırma çalışır.
  useEffect(() => {
    const id = searchParams.get("focus");
    if (!id) return;
    const where = searchParams.get("focusIn");
    // `where` yoksa yedek yol bugün listesine bakıyor; liste henüz boşken karar
    // vermek yanlış sonuç verir, o yüzden gelmesini bekliyoruz.
    if (!where && tasks.length === 0) return;
    setFocusTarget(resolveTaskFocus(id, where, todayTasks.some((t) => t.id === id)) ?? undefined);
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.delete("focus");
        params.delete("focusIn");
        return params;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams, tasks.length]);

  // Panodaki bir karta dönülüyorsa pano açılmalı: kapalıyken kart hiç render
  // edilmiyor, ne kaydırma ne parlama mümkün oluyor.
  useEffect(() => {
    if (focusTarget?.where === "board") setBoardOpen(true);
  }, [focusTarget]);

  // Bugün listesindeki kopyaya kaydırma. Panodakini TaskColumn kendi hallediyor.
  useEffect(() => {
    if (!focusTarget) {
      scrolledFor.current = undefined;
      return;
    }
    if (focusTarget.where !== "today" || scrolledFor.current === focusTarget.id) return;
    const el = todayListRef.current?.querySelector(`[data-id="${focusTarget.id}"]`) as HTMLElement | null;
    if (!el) return;
    scrolledFor.current = focusTarget.id;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusTarget, tasks]);

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
      {/* Başlık ve araç çubuğu TEK satır: ikisi ayrı satırdayken "İşler" başlığı
          tek başına bir satır yiyordu ve üstündeki "Bugün yapılanlar" kartından
          kopuk duruyordu. Seçim modu açıldığında TaskSelectionBar tam genişlik
          isteyip flexWrap ile alta kayıyor — başlık yine üstte kalıyor. */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary, margin: 0 }}>İşler</h3>

        {tasks.length > 0 && (
          <>
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
            onConvert={() => setConvertOpen(true)}
            onArchive={() => setConfirmingBulkAction("archive")}
            onDelete={() => setConfirmingBulkAction("delete")}
            lioTasks={selectedLioTasks(tasks, selection.selectedIds)}
          />
          </>
        )}
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
              <div ref={todayListRef} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todayTasks.map((t) => (
                  <button
                    key={t.id}
                    data-id={t.id}
                    className={
                      focusTarget?.where === "today" && focusTarget.id === t.id ? "task-highlight-flash" : undefined
                    }
                    onClick={() => {
                      if (clickTimer.current) return;
                      clickTimer.current = window.setTimeout(() => {
                        clickTimer.current = null;
                        onEditTask(t);
                      }, 200);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (clickTimer.current) {
                        window.clearTimeout(clickTimer.current);
                        clickTimer.current = null;
                      }
                      openTaskSource(t, "today");
                    }}
                    title="Tıkla: görevi aç · Çift tıkla: görevin bulunduğu sayfaya git"
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

          {/* Panoyu açan satır. Sayı hep görünür: pano kapalıyken bile kaç
              görev olduğu belli olsun. */}
          <button
            type="button"
            onClick={toggleBoard}
            aria-expanded={boardOpen}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 10,
              border: `1px solid ${c.border}`,
              background: c.surface,
              fontFamily: "inherit",
              fontSize: 15,
              fontWeight: 500,
              color: c.textPrimary,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            Tüm görevler
            <span
              style={{
                fontSize: 13,
                fontWeight: 400,
                color: c.textSecondary,
                background: c.background,
                border: `1px solid ${c.border}`,
                borderRadius: 20,
                padding: "1px 8px",
              }}
            >
              {tasks.length}
            </span>
            <span style={{ flex: 1 }} />
            {boardOpen ? (
              <IconChevronUp size={16} color={c.textSecondary} />
            ) : (
              <IconChevronDown size={16} color={c.textSecondary} />
            )}
          </button>

          {/* Masaüstünde üç sütun yan yana, dar ekranda alt alta. */}
          {boardOpen && (
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
                  onTasksReload={onTasksReload}
                  group={`tasks-job-${jobId}`}
                  activeTaskId={activeTaskId}
                  onToggleActive={onToggleActive}
                  getTaskMeta={getTaskMeta}
                  selectionMode={selection.selectionMode}
                  selectedIds={selection.selectedIds}
                  onToggleSelect={selection.toggleSelect}
                  highlightTaskId={focusTarget?.where === "board" ? focusTarget.id : undefined}
                  onOpenSource={(task) => openTaskSource(task, "board")}
                />
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {creating && (
        <CreateTaskModal
          jobId={jobId}
          projects={projects}
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            onTasksReload();
            registerTaskCreateUndo(created);
          }}
        />
      )}

      {convertOpen && (
        <BulkConvertHierarchyModal
          tasks={tasks}
          selectedIds={selection.selectedIds}
          onClose={() => setConvertOpen(false)}
          onDone={() => {
            // Bu pano tam yeniden yükleme yapıyor: hiyerarşi değişince kart
            // başka bir listeye geçtiği için yerel yama yetmez.
            onTasksReload();
            selection.clear();
            setConvertOpen(false);
          }}
        />
      )}

      {movingOpen && (
        <MoveTaskModal
          taskIds={Array.from(selection.selectedIds)}
          // Çıktı hedefinin listelenebilmesi için seçimin kapsamı.
          scopeTasks={tasks.filter((task) => selection.selectedIds.has(task.id))}
          onClose={() => setMovingOpen(false)}
          onMoved={() => {
            selection.clear();
            onTasksReload();
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

export default JobTasksPanel;
