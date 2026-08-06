import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Output, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconChevronRight, IconEdit } from "./icons";
import TaskColumn from "./TaskColumn";
import CreateOutputModal from "./CreateOutputModal";
import EditOutputModal from "./EditOutputModal";
import TaskSelectionBar from "./TaskSelectionBar";
import MoveTaskModal from "./MoveTaskModal";
import { useSortableList } from "../lib/useSortableList";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useTaskSelection } from "../lib/useTaskSelection";

const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

export interface OutputsPanelHandle {
  openCreate: () => void;
}

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
  const selection = useTaskSelection();
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
    openCreate: () => setCreating(true),
  }));

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

  // İş ekibi sekmesinden bir göreve tıklanıp buraya yönlendirildiğinde, o görevin
  // ait olduğu çıktıyı otomatik açıyoruz (alt görevse üst görevin çıktısına bakılır).
  useEffect(() => {
    if (!highlightTaskId || outputs.length === 0) return;
    const target = tasks.find((t) => t.id === highlightTaskId);
    if (!target) return;
    let outputId = target.outputId;
    if (!outputId && target.parentTaskId) {
      const parent = tasks.find((t) => t.id === target.parentTaskId);
      outputId = parent?.outputId;
    }
    if (outputId) setSelectedOutputId(outputId);
  }, [highlightTaskId, tasks, outputs]);

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
        setOutputs((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          return ids.map((oid) => byId.get(oid)!).filter(Boolean);
        });
        api.patch("/outputs/reorder", { ids }).catch(() => reload());
      },
    },
    [outputs.length === 0]
  );

  const selectedOutput = outputs.find((o) => o.id === selectedOutputId) ?? null;

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

        <TaskSelectionBar
          selectionMode={selection.selectionMode}
          selectedCount={selection.selectedIds.size}
          busy={duplicating}
          onEnable={selection.toggleSelectionMode}
          onCancel={selection.clear}
          onDuplicate={handleDuplicateSelected}
          onMove={() => setMovingOpen(true)}
        />

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
                allTasks={outputTasks}
                onCreate={(s, title) => onCreateTask(s, title, { outputId: selectedOutput.id })}
                onCreateSubtask={onCreateSubtask}
                onMove={onMoveTask}
                onToggleComplete={onToggleComplete}
                onEditTask={onEditTask}
                onReorderTasks={onReorderTasks}
                group={`tasks-${scopeKey}-${selectedOutput.id}`}
                activeTaskId={activeTaskId}
                onToggleActive={onToggleActive}
                highlightTaskId={highlightTaskId}
                selectionMode={selection.selectionMode}
                selectedIds={selection.selectedIds}
                onToggleSelect={selection.toggleSelect}
              />
            </div>
          ))}
        </div>

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

        {/* Kalem ikonu bu görünümde de düzenleme modalını açabilsin: modal önceden
            yalnızca liste görünümünde render ediliyordu, bu yüzden çalışmıyordu. */}
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
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontSize: 17, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Çıktılar</h3>
      </div>

      {outputs.length === 0 ? (
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
          Henüz çıktı yok. Örneğin bir müzik projesinde "Sözler", "Master dosyası", "Albüm kapağı" gibi çıktılar
          oluşturabilirsin.
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
          onSaved={handleOutputSaved}
          onDeleted={handleOutputRemoved}
          onArchived={handleOutputRemoved}
        />
      )}
    </div>
  );
});

export default OutputsPanel;
