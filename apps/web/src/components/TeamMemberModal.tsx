import { useState } from "react";
import type { ProjectMember, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconCheck } from "./icons";
import { isAssignedTo } from "../lib/taskAssignees";

interface Props {
  member: ProjectMember;
  tasks: Task[];
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
}

export default function TeamMemberModal({ member, tasks, onClose, onTaskUpdated }: Props) {
  const c = useThemeColors();
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (task: Task) => {
    const assigning = task.assignedTo !== member.userId;
    setBusyId(task.id);
    try {
      const updated = await api.patch<Task>(`/tasks/${task.id}`, {
        assignedTo: assigning ? member.userId : null,
      });
      onTaskUpdated(updated);
    } catch {
      // görev güncellenemedi
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...tasks].sort((a, b) => {
    const aMine = isAssignedTo(a, member.userId) ? 0 : 1;
    const bMine = isAssignedTo(b, member.userId) ? 0 : 1;
    return aMine - bMine;
  });

  return (
    <Modal title={member.fullName ?? "Ekip üyesi"} onClose={onClose} maxWidth={420}>
      <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 14px" }}>
        Bu üyeye atamak istediğin görevleri işaretle. Bir görev yalnızca tek kişiye atanabilir.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary }}>Bu projede görev yok.</p>
        ) : (
          sorted.map((t) => {
            const mine = isAssignedTo(t, member.userId);
            const takenByOther = !!t.assignedTo && !mine;
            return (
              <button
                key={t.id}
                onClick={() => toggle(t)}
                disabled={busyId === t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: mine ? c.background : "transparent",
                  textAlign: "left",
                  opacity: t.parentTaskId ? 0.85 : 1,
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    flexShrink: 0,
                    border: mine ? "none" : `1.5px solid ${c.border}`,
                    background: mine ? c.accent : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {mine && <IconCheck size={10} color="#fff" />}
                </span>
                <span style={{ fontSize: 15, color: c.textPrimary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.parentTaskId ? "↳ " : ""}
                  {t.title}
                </span>
                {takenByOther && <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>atanmış</span>}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
