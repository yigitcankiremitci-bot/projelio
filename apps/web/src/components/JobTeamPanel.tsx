import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import type { JobMember, Project, Task } from "@projelio/shared";
import { api, API_URL } from "../api/client";
import { colors } from "../theme/colors";
import { IconPlus, IconChevronRight, IconCheck, IconActivity } from "./icons";
import HireMemberModal from "./HireMemberModal";
import CreateTaskModal from "./CreateTaskModal";
import { isAssignedTo } from "../lib/taskAssignees";
import { backState } from "../lib/backTarget";

interface Props {
  jobId: string;
  /** Gidilen sayfanın geri bağlantısında yazacak ad (bkz. lib/backTarget.ts). */
  jobTitle?: string;
  tasks: Task[];
  projects: Project[];
  ownerId?: string;
  onTasksReload: () => void;
}

/**
 * Ekleme eylemi panelin başlığında değil, sayfanın "+" düğmesinde.
 * Panel yalnızca tetikleyiciyi dışa açar; FAB kaydını JobDetail yapar
 * (bkz. lib/projectFab.ts — sayfa başına tek kayıt).
 */
export interface JobTeamPanelHandle {
  openHire: () => void;
}

const JobTeamPanel = forwardRef<JobTeamPanelHandle, Props>(function JobTeamPanel(
  { jobId, jobTitle, tasks, projects, ownerId, onTasksReload },
  ref
) {
  const c = colors.light;
  const navigate = useNavigate();
  const [members, setMembers] = useState<JobMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [hiring, setHiring] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  useImperativeHandle(ref, () => ({ openHire: () => setHiring(true) }));

  // Ekip üyelerinden biri "üzerinde çalışıyorum" durumunu değiştirdiğinde,
  // sayfa yenilenmeden bu panelde anlık görünmesi için soket üzerinden dinle.
  useEffect(() => {
    const socket = io(API_URL, { transports: ["websocket"] });
    socket.on("active-worker-changed", (payload: { userId: string; activeTaskId: string | null }) => {
      setMembers((prev) =>
        prev.map((m) => (m.userId === payload.userId ? { ...m, activeTaskId: payload.activeTaskId ?? undefined } : m))
      );
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const taskCounts = (userId: string) => {
    const assigned = tasks.filter((t) => isAssignedTo(t, userId));
    const done = assigned.filter((t) => t.status === "completed").length;
    return { total: assigned.length, done };
  };

  const projectTitle = (projectId?: string) => projects.find((p) => p.id === projectId)?.title ?? "";

  // Göreve tıklanınca ilgili projenin "Çıktılar" sekmesine gidip doğru çıktıyı açıyor
  // ve görevi kısa süreliğine parlatarak fark edilir hale getiriyoruz.
  const goToTask = (task: Task) => {
    navigate(`/projects/${task.projectId}`, {
      state: {
        highlightTaskId: task.id,
        // Geri bağlantısı işin Ekip sekmesine dönsün (bkz. lib/backTarget.ts).
        ...backState({ to: `/jobs/${jobId}?tab=team`, label: jobTitle || "Ekip" }),
      },
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>İş ekibi</h4>

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : members.length === 0 ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Bu işte henüz kimse yok. "+" düğmesiyle birini davet edebilirsin.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => {
            const { total, done } = taskCounts(m.userId);
            const isOpen = expandedId === m.id;
            const activeTask = m.activeTaskId ? tasks.find((t) => t.id === m.activeTaskId) : undefined;

            const memberTasks = tasks
              .filter((t) => isAssignedTo(t, m.userId))
              .sort((a, b) => (a.status === "completed" ? 1 : 0) - (b.status === "completed" ? 1 : 0));

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
                      {/* İşe alma bir davettir: kişi kabul edene kadar ekipten
                          sayılmaz. İş sahibi kimin beklediğini, kimin reddettiğini
                          görsün ki boşuna beklemesin. */}
                      {m.status === "pending" && (
                        <span style={{ fontSize: 12, color: c.textSecondary, background: c.background, border: `1px solid ${c.border}`, borderRadius: 20, padding: "1px 7px" }}>
                          Yanıt bekliyor
                        </span>
                      )}
                      {m.status === "rejected" && (
                        <span style={{ fontSize: 12, color: c.danger, background: `${c.danger}14`, borderRadius: 20, padding: "1px 7px" }}>
                          Reddetti
                        </span>
                      )}
                    </div>
                    {activeTask ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span className="active-task-pulse" style={{ display: "inline-flex", borderRadius: "50%" }}>
                          <IconActivity size={11} color={c.accentDark} filled />
                        </span>
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
                      Bu kişiye atanmış görevler. Birine dokunarak ilgili proje ve çıktıya gidebilirsin.
                    </p>
                    {memberTasks.length === 0 ? (
                      <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>Henüz atanmış görevi yok.</p>
                    ) : (
                      memberTasks.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => goToTask(t)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${c.border}`,
                            background: t.status === "completed" ? c.background : "transparent",
                            textAlign: "left",
                            opacity: t.parentTaskId ? 0.85 : 1,
                          }}
                        >
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: "50%",
                              flexShrink: 0,
                              border: t.status === "completed" ? "none" : `1.5px solid ${c.border}`,
                              background: t.status === "completed" ? c.success : "transparent",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            {t.status === "completed" && <IconCheck size={10} color="#fff" />}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 15,
                                color: c.textPrimary,
                                textDecoration: t.status === "completed" ? "line-through" : "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t.parentTaskId ? "↳ " : ""}
                              {t.title}
                            </div>
                            <div style={{ fontSize: 12, color: c.textSecondary }}>{projectTitle(t.projectId)}</div>
                          </div>
                          {t.id === m.activeTaskId && (
                            <span className="active-task-pulse" style={{ display: "inline-flex", borderRadius: "50%", flexShrink: 0 }}>
                              <IconActivity size={12} color={c.accentDark} filled />
                            </span>
                          )}
                          <IconChevronRight size={13} color={c.textSecondary} />
                        </button>
                      ))
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
          // Daveti reddetmiş kişi tekrar davet edilebilmeli; yalnızca ekipte
          // olan ve yanıt bekleyenler arama sonuçlarından elenir.
          existingUserIds={members.filter((m) => m.status !== "rejected").map((m) => m.userId)}
          onClose={() => setHiring(false)}
          onHired={() => {
            // Reddedilmiş bir kayıt yeniden davete döndüğünde listeye ikinci kez
            // eklenmemesi için listeyi sunucudan tazeliyoruz.
            load();
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
});

export default JobTeamPanel;
