import { useState } from "react";
import type { JobMember, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconCheck } from "./icons";
import { isAssignedTo } from "../lib/taskAssignees";
import { useT } from "../lib/i18n";

interface Props {
  member: JobMember;
  tasks: Task[];
  projects: Project[];
  onClose: () => void;
  onTaskUpdated: (task: Task) => void;
}

export default function JobMemberTasksModal({ member, tasks, projects, onClose, onTaskUpdated }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [busyId, setBusyId] = useState<string | null>(null);

  const projectTitle = (projectId?: string) => projects.find((p) => p.id === projectId)?.title ?? "";

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
    <Modal title={member.fullName ?? t("Ekip üyesi")} onClose={onClose} maxWidth={440}>
      <p style={{ fontSize: 15, color: c.textSecondary, margin: "0 0 14px" }}>
        {t("Bu kişiye atamak istediğin görevleri işaretle. Bir görev yalnızca tek kişiye atanabilir.")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 400, overflowY: "auto" }}>
        {sorted.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Bu işte henüz görev yok.")}</p>
        ) : (
          sorted.map((gorev) => {
            const mine = isAssignedTo(gorev, member.userId);
            const takenByOther = !!gorev.assignedTo && !mine;
            return (
              <button
                key={gorev.id}
                onClick={() => toggle(gorev)}
                disabled={busyId === gorev.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: mine ? c.background : "transparent",
                  textAlign: "left",
                  opacity: gorev.parentTaskId ? 0.85 : 1,
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {gorev.parentTaskId ? "↳ " : ""}
                    {gorev.title}
                  </div>
                  <div style={{ fontSize: 12, color: c.textSecondary }}>{projectTitle(gorev.projectId)}</div>
                </div>
                {takenByOther && <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>{t("atanmış")}</span>}
              </button>
            );
          })
        )}
      </div>
    </Modal>
  );
}
