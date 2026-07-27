import { useEffect, useState } from "react";
import type { JobMember, Project, Task } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconPlus } from "./icons";
import HireMemberModal from "./HireMemberModal";
import JobMemberTasksModal from "./JobMemberTasksModal";
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
  const [selected, setSelected] = useState<JobMember | null>(null);
  const [assigningTo, setAssigningTo] = useState<JobMember | null>(null);

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
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(m);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
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
                  {m.title && <span style={{ fontSize: 13, color: c.textSecondary }}>{m.title}</span>}
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

      {selected && (
        <JobMemberTasksModal
          member={selected}
          tasks={tasks}
          projects={projects}
          onClose={() => setSelected(null)}
          onTaskUpdated={onTaskUpdated}
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
