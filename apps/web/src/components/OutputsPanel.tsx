import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Output, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconChevronRight, IconEdit } from "./icons";
import TaskColumn, { TaskColumnHandle } from "./TaskColumn";
import CreateOutputModal from "./CreateOutputModal";
import EditOutputModal from "./EditOutputModal";
import TaskSelectionBar from "./TaskSelectionBar";
import TaskSortMenu from "./TaskSortMenu";
import MoveTaskModal from "./MoveTaskModal";
import { useSortableList } from "../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo } from "../lib/undo";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useTaskSelection } from "../lib/useTaskSelection";
import { sortTasks, type TaskSortMode } from "../lib/taskSort";

const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

export interface OutputsPanelHandle {
  /** "Çıktılar" alt sekmesine geçip yeni çıktı modalını açar. */
  openCreateOutput: () => void;
  /** "Görevler" alt sekmesine geçip "Yapılacak" sütununun hızlı ekleme kutusunu açar. */
  openCreateTask: () => void;
}

/**
 * Sekmenin iki görünümü. Varsayılan "tasks": kullanıcıların çoğu buraya bir görev
 * eklemek/görmek için geliyor, çıktı katmanı ise ara sıra kurulan bir yapı.
 * Çıktılar önce gelen tek ekran olduğunda insanlar sekmenin ne işe yaradığını
 * anlamıyordu.
 */
type OutputsView = "tasks" | "outputs";

interface Props {
  // İkisinden biri verilmeli: proje çıktıları için projectId, departman
  // çıktıları için departmentId.
  projectId?: string;
  departmentId?: string;
  tasks: Task[];
  onCreateTask: (
    status: TaskStatus,
    title: string,
    options?: { weekNumber?: number; deadline?: string; startDate?: string; outputId?: string }
  ) => void;
  onCreateSubtask: (parentId: string, title: string) => void;
  onMoveTask: (taskId: string, status: TaskStatus) => void;
  onToggleComplete: (taskId: string) => void;
  onEditTask: (task: Task) => void;
  // Başlığa çift tıklayarak yerinde ad değiştirme (bkz. TaskColumn.onTaskRenamed).
  onTaskRenamed?: (updated: Task) => void;
  onReorderTasks: (ids: string[]) => void;
  activeTaskId?: string;
  onToggleActive?: (taskId: string) => void;
  // Verilirse (ör. iş ekibi sekmesinden yönlendirildiğinde), bu görevin ait olduğu
  // çıktı otomatik açılır ve görev kısa süreliğine parlayarak fark edilir hale gelir.
  highlightTaskId?: string;
  // Çoklu seçimle çoğaltma/taşıma sonrası üst bileşenin kendi `tasks` state'ini
  // güncelleyebilmesi için (bkz. TaskSelectionBar/MoveTaskModal, useTaskSelection).
  onTasksDuplicated?: (created: Task[]) => void;
  onTasksMoved?: (moved: Task[]) => void;
}

const OutputsPanel = forwardRef<OutputsPanelHandle, Props>(function OutputsPanel({
  projectId,
  departmentId,
  tasks,
  onCreateTask,
  onCreateSubtask,
  onMoveTask,
  onToggleComplete,
  onEditTask,
  onTaskRenamed,
  onReorderTasks,
  activeTaskId,
  onToggleActive,
  highlightTaskId,
  onTasksDuplicated,
  onTasksMoved,
}, ref) {
  const c = colors.light;
  const isDesktop = useIsDesktop();
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingOutput, setEditingOutput] = useState<Output | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const registerReorderUndo = useReorderUndo();
  const outputsRef = useLatestRef(outputs);
  const selection = useTaskSelection();
  const [sort, setSort] = useState<TaskSortMode>("manual");
  const [view, setView] = useState<OutputsView>("tasks");
  // "Görevler" görünümünde FAB'ın hızlı ekleme kutusunu açabilmesi için.
  const columnRefs = useRef<Partial<Record<TaskStatus, TaskColumnHandle | null>>>({});
  const pendingCreateTaskRef = useRef(false);
  const [duplicating, setDuplicating] = useState(false);
  const [movingOpen, setMovingOpen] = useState(false);

  const handleDuplicateSelected = async () => {
    if (selection.selectedIds.size === 0) return;
    setDuplicating(true);
    try {
      const created = await api.post<Task[]>("/tasks/duplicate", { ids: Array.from(selection.selectedIds) });
      onTasksDuplicated?.(created);
      selection.clear();
    } catch {
      // çoğaltılamadı, kullanıcı tekrar deneyebilir
    } finally {
      setDuplicating(false);
    }
  };

  useImperativeHandle(ref, () => ({
    openCreateOutput: () => {
      setView("outputs");
      setSelectedOutputId(null);
      setCreating(true);
    },
    openCreateTask: () => {
      // Zaten görev görünümündeysek sütunlar mount, doğrudan açabiliriz.
      if (view === "tasks") {
        columnRefs.current.todo?.openCreate();
        return;
      }
      // Değilsek sütunlar henüz yok: görünümü değiştirip ekleme kutusunu
      // render'dan SONRA açıyoruz (aksi halde ref boş olur ve hiçbir şey olmaz).
      pendingCreateTaskRef.current = true;
      setSelectedOutputId(null);
      setView("tasks");
    },
  }));

  useEffect(() => {
    if (view !== "tasks" || !pendingCreateTaskRef.current) return;
    pendingCreateTaskRef.current = false;
    columnRefs.current.todo?.openCreate();
  }, [view]);

  const scopeKey = departmentId ?? projectId ?? "";
  const outputsPath = departmentId ? `/departments/${departmentId}/outputs` : `/projects/${projectId}/outputs`;

  const reload = () => {
    api.get<Output[]>(outputsPath).then(setOutputs).catch(() => setOutputs([]));
  };

  const handleOutputSaved = (updated: Output) => {
    setOutputs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  const handleOutputRemoved = (removedOutputId: string) => {
    setOutputs((prev) => prev.filter((o) => o.id !== removedOutputId));
    setEditingOutput(null);
    if (selectedOutputId === removedOutputId) setSelectedOutputId(null);
  };

  useEffect(reload, [projectId, departmentId]);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(reload);

  // İş ekibi sekmesinden bir göreve tıklanıp buraya yönlendirildiğinde "Görevler"
  // görünümüne dönüyoruz: liste artık düz olduğu için görevin hangi çıktıya ait
  // olduğunu bulup o çıktıyı açmaya gerek yok, TaskColumn kartı doğrudan bulup
  // görünüre kaydırıyor.
  useEffect(() => {
    if (!highlightTaskId) return;
    setView("tasks");
    setSelectedOutputId(null);
  }, [highlightTaskId]);

  useSortableList(
    listRef,
    {
      filter: "button",
      preventOnFilter: false,
      onEnd: () => {
        const el = listRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id)
          .filter((v): v is string => Boolean(v));
        const previousIds = outputsRef.current.map((o) => o.id);
        setOutputs((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          return ids.map((oid) => byId.get(oid)!).filter(Boolean);
        });
        api.patch("/outputs/reorder", { ids }).catch(() => reload());
        registerReorderUndo("/outputs/reorder", previousIds, ids, reload);
      },
    },
    [outputs.length === 0]
  );

  const selectedOutput = outputs.find((o) => o.id === selectedOutputId) ?? null;
  const outputTitleById = new Map(outputs.map((o) => [o.id, o.title]));

  /** Görevin (alt görevse üst görevinin) bağlı olduğu çıktının adı. */
  const outputLabel = (task: Task): string | undefined => {
    const owner = task.parentTaskId ? tasks.find((t) => t.id === task.parentTaskId) ?? task : task;
    return owner.outputId ? outputTitleById.get(owner.outputId) : undefined;
  };

  /**
   * Kanban gövdesi. Hem düz görev listesi hem tek bir çıktının içi aynı gövdeyi
   * kullanır — iki görünüm arasında davranış farkı olmasın diye tek yerde duruyor.
   */
  const renderBoard = (
    list: Task[],
    opts: { group: string; outputId?: string; showOutputName: boolean; bindRefs: boolean }
  ) => (
    <>
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
          <div key={status} style={isDesktop ? { flex: "1 1 260px", minWidth: 260 } : { width: "100%" }}>
            <TaskColumn
              ref={
                opts.bindRefs
                  ? (el) => {
                      columnRefs.current[status] = el;
                    }
                  : undefined
              }
              status={status}
              allTasks={sortTasks(list, sort)}
              onCreate={(st, title) => onCreateTask(st, title, opts.outputId ? { outputId: opts.outputId } : undefined)}
              onCreateSubtask={onCreateSubtask}
              onMove={onMoveTask}
              onToggleComplete={onToggleComplete}
              onEditTask={onEditTask}
              onTaskRenamed={onTaskRenamed}
              // Başka bir ölçütle sıralıyken sürükleyip sıra değiştirmek anlamsız.
              onReorderTasks={sort === "manual" ? onReorderTasks : undefined}
              group={opts.group}
              activeTaskId={activeTaskId}
              onToggleActive={onToggleActive}
              highlightTaskId={highlightTaskId}
              // Düz listede kartın hangi çıktıya ait olduğu yazılır; bir çıktının
              // içindeyken zaten hepsi aynı çıktıya ait, tekrarlamak gürültü olur.
              getTaskMeta={opts.showOutputName ? outputLabel : undefined}
              selectionMode={selection.selectionMode}
              selectedIds={selection.selectedIds}
              onToggleSelect={selection.toggleSelect}
            />
          </div>
        ))}
      </div>
    </>
  );

  /**
   * Tek satırlık araç çubuğu: solda alt sekmeler, sağda sıralama ve seçim.
   * Üçü ayrı satırdayken kart panelleriyle sekmeler arasında geniş bir boşluk
   * kalıyordu. Seçim modu açıldığında bar tam genişlik alıp alta kayar
   * (bkz. TaskSelectionBar inline).
   */
  const toolbar = (
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
      <div role="group" aria-label="Görünüm" style={{ display: "flex", gap: 4 }}>
        {(
          [
            { value: "tasks", label: "Görevler" },
            { value: "outputs", label: "Çıktılar" },
          ] as { value: OutputsView; label: string }[]
        ).map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => {
              selection.clear();
              setSelectedOutputId(null);
              setView(t.value);
            }}
            aria-pressed={view === t.value}
            style={{
              padding: "6px 14px",
              fontSize: 14,
              borderRadius: 8,
              border: `1px solid ${view === t.value ? c.primary : c.border}`,
              background: view === t.value ? `${c.primary}12` : c.surface,
              color: view === t.value ? c.textPrimary : c.textSecondary,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
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
  );

  const sharedModals = (
    <>
      {movingOpen && (
        <MoveTaskModal
          taskIds={Array.from(selection.selectedIds)}
          onClose={() => setMovingOpen(false)}
          onMoved={(moved) => {
            onTasksMoved?.(moved);
            selection.clear();
          }}
        />
      )}
      {creating && (
        <CreateOutputModal
          projectId={projectId}
          departmentId={departmentId}
          onClose={() => setCreating(false)}
          onCreated={reload}
        />
      )}
      {editingOutput && (
        <EditOutputModal
          output={editingOutput}
          onClose={() => setEditingOutput(null)}
          onSaved={(updated) => {
            handleOutputSaved(updated);
            setEditingOutput(null);
          }}
          onDeleted={handleOutputRemoved}
          onArchived={handleOutputRemoved}
        />
      )}
    </>
  );

  // ------------------------------------------------------------- Görevler
  if (view === "tasks") {
    return (
      <div>
        {toolbar}
        {renderBoard(tasks, { group: `tasks-${scopeKey}`, showOutputName: true, bindRefs: true })}
        {sharedModals}
      </div>
    );
  }

  // ------------------------------------- Çıktılar > tek bir çıktının içi
  if (selectedOutput) {
    const outputTasks = tasks.filter((t) => {
      if (t.parentTaskId) {
        const parent = tasks.find((p) => p.id === t.parentTaskId);
        return parent?.outputId === selectedOutput.id;
      }
      return t.outputId === selectedOutput.id;
    });

    return (
      <div>
        {toolbar}

        <button
          onClick={() => {
            selection.clear();
            setSelectedOutputId(null);
          }}
          style={{ fontSize: 15, color: c.textSecondary, background: "transparent", border: "none", padding: 0, marginBottom: 10 }}
        >
          ← Çıktılar
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 19, fontWeight: 500, color: c.textPrimary, margin: "0 0 2px" }}>{selectedOutput.title}</h3>
            {selectedOutput.description && (
              <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>{selectedOutput.description}</p>
            )}
          </div>
          <button
            onClick={() => setEditingOutput(selectedOutput)}
            aria-label="Çıktıyı düzenle"
            style={{ background: "transparent", border: "none", padding: 4, display: "flex", flexShrink: 0 }}
          >
            <IconEdit size={14} color={c.textSecondary} />
          </button>
        </div>

        {renderBoard(outputTasks, {
          group: `tasks-${scopeKey}-${selectedOutput.id}`,
          outputId: selectedOutput.id,
          showOutputName: false,
          bindRefs: false,
        })}

        {sharedModals}
      </div>
    );
  }

  // ------------------------------------------------- Çıktılar > liste
  return (
    <div>
      {toolbar}

      {outputs.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 16,
            lineHeight: 1.5,
          }}
        >
          Çıktı, projenin ortaya çıkaracağı somut şey — bir müzik projesinde "Sözler", "Master dosyası", "Albüm
          kapağı" gibi. Görevleri bunların altında toplayabilirsin; zorunlu değil, istersen görevler sekmesinde
          düz liste olarak da çalışabilirsin.
        </div>
      ) : (
        <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {outputs.map((o) => {
            const topLevel = tasks.filter((t) => t.outputId === o.id && !t.parentTaskId);
            const completed = topLevel.filter((t) => t.status === "completed").length;
            return (
              <div
                key={o.id}
                data-id={o.id}
                onClick={() => setSelectedOutputId(o.id)}
                role="button"
                tabIndex={0}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1px solid ${c.border}`,
                  background: c.surface,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary, marginBottom: o.description ? 2 : 0 }}>
                    {o.title}
                  </div>
                  {o.description && (
                    <div style={{ fontSize: 15, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {o.description}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {topLevel.length > 0 && (
                    <span style={{ fontSize: 13, color: c.textSecondary, background: c.background, border: `1px solid ${c.border}`, borderRadius: 20, padding: "2px 8px" }}>
                      {completed}/{topLevel.length}
                    </span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingOutput(o);
                    }}
                    aria-label="Çıktıyı düzenle"
                    style={{ background: "transparent", border: "none", padding: 2, display: "flex" }}
                  >
                    <IconEdit size={13} color={c.textSecondary} />
                  </button>
                  <IconChevronRight size={14} color={c.textSecondary} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sharedModals}
    </div>
  );
});

export default OutputsPanel;
