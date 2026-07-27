import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Output, Task, TaskStatus } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconChevronRight, IconEdit } from "./icons";
import TaskColumn from "./TaskColumn";
import CreateOutputModal from "./CreateOutputModal";
import EditOutputModal from "./EditOutputModal";
import { useSortableList } from "../lib/useSortableList";

const columns: TaskStatus[] = ["in_progress", "todo", "completed"];

export interface OutputsPanelHandle {
  openCreate: () => void;
}

interface Props {
  projectId: string;
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
}

const OutputsPanel = forwardRef<OutputsPanelHandle, Props>(function OutputsPanel({
  projectId,
  tasks,
  onCreateTask,
  onCreateSubtask,
  onMoveTask,
  onToggleComplete,
  onEditTask,
  onReorderTasks,
  activeTaskId,
  onToggleActive,
}, ref) {
  const c = colors.light;
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingOutput, setEditingOutput] = useState<Output | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    openCreate: () => setCreating(true),
  }));

  const reload = () => {
    api.get<Output[]>(`/projects/${projectId}/outputs`).then(setOutputs).catch(() => setOutputs([]));
  };

  const handleOutputSaved = (updated: Output) => {
    setOutputs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  };

  const handleOutputRemoved = (removedOutputId: string) => {
    setOutputs((prev) => prev.filter((o) => o.id !== removedOutputId));
    setEditingOutput(null);
    if (selectedOutputId === removedOutputId) setSelectedOutputId(null);
  };

  useEffect(reload, [projectId]);

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
          onClick={() => setSelectedOutputId(null)}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {columns.map((status) => (
            <TaskColumn
              key={status}
              status={status}
              allTasks={outputTasks}
              onCreate={(s, title) => onCreateTask(s, title, { outputId: selectedOutput.id })}
              onCreateSubtask={onCreateSubtask}
              onMove={onMoveTask}
              onToggleComplete={onToggleComplete}
              onEditTask={onEditTask}
              onReorderTasks={onReorderTasks}
              group={`tasks-${projectId}-${selectedOutput.id}`}
              activeTaskId={activeTaskId}
              onToggleActive={onToggleActive}
            />
          ))}
        </div>
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

      {creating && <CreateOutputModal projectId={projectId} onClose={() => setCreating(false)} onCreated={reload} />}
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
