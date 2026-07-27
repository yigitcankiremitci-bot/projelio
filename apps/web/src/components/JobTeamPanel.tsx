import { useEffect, useState } from "react";
import type { JobMember, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconPlus, IconChevronRight, IconCheck, IconActivity } from "./icons";
import HireMemberModal from "./HireMemberModal";
import CreateTaskModal from "./CreateTaskModal";

interface Props {
  jobId: string;
  tasks: Task[];
  projects: Project[];
  ownerId?: string;
  onTaskUpdated: (task: Task) => void;
  onTasksReload: () => void;
}

export default function JobTeamPanel({ jobId, tasks, projects, ownerId, onTaskUpdated, onTasksReload }: Props) {
  const c = colors.light;
  const [members, setMembers] = useState<JobMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiring, setHiring] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [assigningTo, setAssigningTo] = useState<JobMember | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<JobMember[]>(`/jobs/${jobId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [jobId]);

  const taskCounts = (userId: string) => {
    const assigned = tasks.filter((t) => t.assignedTo === userId);
    const done = assigned.filter((t) => t.status === "completed").length;
    return { total: assigned.length, done };
  };

  const projectTitle = (projectId: string) => projects.find((p) => p.id === projectId)?.title ?? "";

  const toggleAssignment = async (member: JobMember, task: Task) => {
    const assigning = task.assignedTo !== member.userId;
    setBusyTaskId(task.id);
    try {
      const updated = await api.patch<Task>(`/tasks/${task.id}`, {
        assignedTo: assigning ? member.userId : null,
      });
      onTaskUpdated(updated);
    } catch {
      // görev güncellenemedi
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>İş ekibi</h4>
        <button
          onClick={() => setHiring(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: "#fff",
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          <IconPlus size={13} color="#fff" />
          İşe al
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Bu işte henüz kimse yok. "İşe al" ile birini ekleyebilirsin.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => {
            const { total, done } = taskCounts(m.userId);
            const isOpen = expandedId === m.id;
            const activeTask = m.activeTaskId ? tasks.find((t) => t.id === m.activeTaskId) : undefined;

            const memberTasks = [...tasks].sort((a, b) => {
              const aMine = a.assignedTo === m.userId ? 0 : 1;
              const bMine = b.assignedTo === m.userId ? 0 : 1;
              return aMine - bMine;
            });

            return (
              <div key={m.id} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedId(isOpen ? null : m.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setExpandedId(isOpen ? null : m.id);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      background: c.background,
                      border: `1px solid ${c.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 15,
                      fontWeight: 600,
                      color: c.primary,
                      flexShrink: 0,
                    }}
                  >
                    {(m.fullName ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 16, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.fullName ?? "Bilinmeyen kullanıcı"}
                      </span>
                      {m.userId === ownerId && (
                        <span style={{ fontSize: 12, color: c.accentDark, background: `${c.accent}22`, borderRadius: 20, padding: "1px 7px" }}>
                          Yönetici
                        </span>
                      )}
                    </div>
                    {activeTask ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <IconActivity size={11} color={c.accentDark} filled />
                        <span style={{ fontSize: 13, color: c.accentDark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          şu an: {activeTask.title}
                        </span>
                      </div>
                    ) : (
                      m.title && <span style={{ fontSize: 13, color: c.textSecondary }}>{m.title}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: c.textSecondary, flexShrink: 0 }}>
                    {done}/{total} görev
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningTo(m);
                    }}
                    aria-label={`${m.fullName ?? "Kişi"} için görev ata`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      border: `1px solid ${c.border}`,
                      background: c.background,
                      flexShrink: 0,
                    }}
                  >
                    <IconPlus size={13} color={c.textSecondary} />
                  </button>
                  <span
                    style={{
                      display: "inline-flex",
                      flexShrink: 0,
                      transform: isOpen ? "rotate(90deg)" : "none",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <IconChevronRight size={14} color={c.textSecondary} />
                  </span>
                </div>

                <div
                  style={{
                    maxHeight: isOpen ? 2000 : 0,
                    overflow: "hidden",
                    transition: "max-height 0.25s ease",
                  }}
                >
                  <div style={{ borderTop: `1px solid ${c.border}`, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <p style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 4px" }}>
                      Bu kişiye atamak istediğin görevleri işaretle.
                    </p>
                    {memberTasks.length === 0 ? (
                      <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>Bu işte henüz görev yok.</p>
                    ) : (
                      memberTasks.map((t) => {
                        const mine = t.assignedTo === m.userId;
                        const takenByOther = !!t.assignedTo && !mine;
                        return (
                          <button
                            key={t.id}
                            onClick={() => toggleAssignment(m, t)}
                            disabled={busyTaskId === t.id}
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
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {t.parentTaskId ? "↳ " : ""}
                                {t.title}
                              </div>
                              <div style={{ fontSize: 12, color: c.textSecondary }}>{projectTitle(t.projectId)}</div>
                            </div>
                            {t.id === m.activeTaskId && <IconActivity size={12} color={c.accentDark} filled />}
                            {takenByOther && <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>atanmış</span>}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hiring && (
        <HireMemberModal
          jobId={jobId}
          existingUserIds={members.map((m) => m.userId)}
          onClose={() => setHiring(false)}
          onHired={(m) => {
            setMembers((prev) => [...prev, m]);
            setHiring(false);
          }}
        />
      )}

      {assigningTo && (
        <CreateTaskModal
          jobId={jobId}
          projects={projects}
          fixedAssignedTo={assigningTo.userId}
          fixedAssignedToName={assigningTo.fullName}
          onClose={() => setAssigningTo(null)}
          onCreated={onTasksReload}
        />
      )}
    </div>
  );
}
