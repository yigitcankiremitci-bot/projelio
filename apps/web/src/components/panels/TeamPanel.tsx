import { useEffect, useState } from "react";
import type { ProjectMember, Task } from "@projelio/shared";
import { api } from "../../api/client";
import { colors } from "../../theme/colors";
import { IconPlus } from "../icons";
import AddMemberModal from "../AddMemberModal";
import TeamMemberModal from "../TeamMemberModal";

interface Props {
  projectId: string;
  tasks: Task[];
  ownerId?: string;
  onTaskUpdated: (task: Task) => void;
}

const roleLabel: Record<string, string> = {
  owner: "Sahip",
  member: "Ekip üyesi",
  subcontractor: "Taşeron",
};

export default function TeamPanel({ projectId, tasks, ownerId, onTaskUpdated }: Props) {
  const c = colors.light;
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<ProjectMember | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<ProjectMember[]>(`/projects/${projectId}/members`)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]);

  const taskCounts = (userId: string) => {
    const assigned = tasks.filter((t) => t.assignedTo === userId);
    const done = assigned.filter((t) => t.status === "completed").length;
    return { total: assigned.length, done };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ fontSize: 13, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Ekip üyeleri</h4>
        <button
          onClick={() => setAdding(true)}
          aria-label="Ekibe üye ekle"
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            border: "none",
            background: c.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconPlus size={14} color="#fff" />
        </button>
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: c.textSecondary }}>Yükleniyor…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 12, color: c.textSecondary }}>Henüz ekip üyesi eklenmedi.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => {
            const { total, done } = taskCounts(m.userId);
            return (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: c.surface,
                  border: `1px solid ${c.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  textAlign: "left",
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
                    fontSize: 12,
                    fontWeight: 600,
                    color: c.primary,
                    flexShrink: 0,
                  }}
                >
                  {(m.fullName ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.fullName ?? "Bilinmeyen kullanıcı"}
                    </span>
                    {m.userId === ownerId && (
                      <span style={{ fontSize: 10, color: c.accentDark, background: `${c.accent}22`, borderRadius: 20, padding: "1px 7px" }}>
                        Yönetici
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: c.textSecondary }}>{roleLabel[m.role] ?? m.role}</span>
                </div>
                <span style={{ fontSize: 11, color: c.textSecondary, flexShrink: 0 }}>
                  {done}/{total} görev
                </span>
              </button>
            );
          })}
        </div>
      )}

      {adding && (
        <AddMemberModal
          projectId={projectId}
          existingUserIds={members.map((m) => m.userId)}
          onClose={() => setAdding(false)}
          onAdded={(m) => {
            setMembers((prev) => [...prev, m]);
            setAdding(false);
          }}
        />
      )}

      {selected && (
        <TeamMemberModal
          member={selected}
          tasks={tasks}
          onClose={() => setSelected(null)}
          onTaskUpdated={onTaskUpdated}
        />
      )}
    </div>
  );
}
