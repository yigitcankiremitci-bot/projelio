import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ArchiveSummary, ArchivedTaskEntry } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { IconArchive, IconRestore, IconTrash } from "../components/icons";
import ConfirmDialog from "../components/ConfirmDialog";

type EntityKind = "jobs" | "projects" | "tasks" | "outputs";

function permanentDeleteMessage(kind: EntityKind, title: string): string {
  switch (kind) {
    case "jobs":
      return `"${title}" işini kalıcı olarak silmek istediğine emin misin? Bu işe bağlı tüm projeler, görevler ve çıktılar da kalıcı olarak silinecek. Bu işlem geri alınamaz.`;
    case "projects":
      return `"${title}" projesini kalıcı olarak silmek istediğine emin misin? Bu projeye bağlı tüm görevler, alt görevler ve çıktılar da kalıcı olarak silinecek. Bu işlem geri alınamaz.`;
    case "tasks":
      return `"${title}" görevini kalıcı olarak silmek istediğine emin misin? Varsa bu göreve bağlı alt görevler de kalıcı olarak silinecek. Bu işlem geri alınamaz.`;
    case "outputs":
      return `"${title}" çıktısını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.`;
  }
}

interface ProjectGroup {
  projectId: string;
  projectTitle: string;
  projectArchivedAt?: string;
  outputs: { id: string; title: string; archivedAt: string }[];
  topTasks: ArchivedTaskEntry[];
  subtasksByParent: Map<string, ArchivedTaskEntry[]>;
  orphanSubtasks: ArchivedTaskEntry[];
}

interface JobGroup {
  jobId: string;
  jobTitle: string;
  jobArchivedAt?: string;
  projects: Map<string, ProjectGroup>;
}

function ensureJobGroup(map: Map<string, JobGroup>, jobId: string, jobTitle: string) {
  let group = map.get(jobId);
  if (!group) {
    group = { jobId, jobTitle, projects: new Map() };
    map.set(jobId, group);
  }
  return group;
}

function ensureProjectGroup(job: JobGroup, projectId: string, projectTitle: string) {
  let group = job.projects.get(projectId);
  if (!group) {
    group = { projectId, projectTitle, outputs: [], topTasks: [], subtasksByParent: new Map(), orphanSubtasks: [] };
    job.projects.set(projectId, group);
  }
  return group;
}

function buildGroups(data: ArchiveSummary): JobGroup[] {
  const jobMap = new Map<string, JobGroup>();

  for (const j of data.jobs) {
    const group = ensureJobGroup(jobMap, j.id, j.title);
    group.jobArchivedAt = j.archivedAt;
  }

  for (const p of data.projects) {
    const job = ensureJobGroup(jobMap, p.jobId, p.jobTitle);
    const project = ensureProjectGroup(job, p.id, p.title);
    project.projectArchivedAt = p.archivedAt;
  }

  for (const o of data.outputs) {
    const job = ensureJobGroup(jobMap, o.jobId, o.jobTitle);
    const project = ensureProjectGroup(job, o.projectId, o.projectTitle);
    project.outputs.push({ id: o.id, title: o.title, archivedAt: o.archivedAt });
  }

  const topTaskIds = new Set(data.tasks.filter((t) => !t.isSubtask).map((t) => t.id));

  for (const t of data.tasks) {
    const job = ensureJobGroup(jobMap, t.jobId, t.jobTitle);
    const project = ensureProjectGroup(job, t.projectId, t.projectTitle);
    if (!t.isSubtask) {
      project.topTasks.push(t);
    } else if (t.parentTaskId && topTaskIds.has(t.parentTaskId)) {
      const list = project.subtasksByParent.get(t.parentTaskId) ?? [];
      list.push(t);
      project.subtasksByParent.set(t.parentTaskId, list);
    } else {
      project.orphanSubtasks.push(t);
    }
  }

  return Array.from(jobMap.values()).sort((a, b) => a.jobTitle.localeCompare(b.jobTitle, "tr"));
}

export default function Archive() {
  const c = colors.light;
  const [data, setData] = useState<ArchiveSummary | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: EntityKind; id: string; title: string } | null>(null);

  const reload = () => {
    api.get<ArchiveSummary>("/archive").then(setData).catch(() => setData(null));
  };

  useEffect(reload, []);

  const restore = async (kind: EntityKind, id: string) => {
    setRestoringId(id);
    try {
      await api.patch(`/${kind}/${id}/restore`, {});
      reload();
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmDelete) return;
    await api.delete(`/${confirmDelete.kind}/${confirmDelete.id}`);
    setConfirmDelete(null);
    reload();
  };

  const isEmpty =
    data && data.jobs.length === 0 && data.projects.length === 0 && data.tasks.length === 0 && data.outputs.length === 0;

  const groups = data ? buildGroups(data) : [];

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <Link to="/settings" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", marginBottom: 14 }}>
        ← Ayarlar
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <IconArchive size={20} color={c.textPrimary} />
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Arşiv</h1>
      </div>

      {!data && <p style={{ fontSize: 16, color: c.textSecondary }}>Yükleniyor…</p>}

      {isEmpty && (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 16,
          }}
        >
          Arşivde henüz bir şey yok. Sildiğin yerine arşive eklediğin işler, projeler, görevler ve çıktılar burada
          görünecek.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
        {groups.map((job) => (
          <div key={job.jobId} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
            <Row
              label="İş"
              title={job.jobTitle}
              archived={Boolean(job.jobArchivedAt)}
              archivedAt={job.jobArchivedAt}
              restoring={restoringId === job.jobId}
              onRestore={job.jobArchivedAt ? () => restore("jobs", job.jobId) : undefined}
              onRequestDelete={job.jobArchivedAt ? () => setConfirmDelete({ kind: "jobs", id: job.jobId, title: job.jobTitle }) : undefined}
              c={c}
              titleSize={18}
            />

            {Array.from(job.projects.values()).map((project) => (
              <div key={project.projectId} style={{ marginTop: 10, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                <Row
                  label="Proje"
                  title={project.projectTitle}
                  archived={Boolean(project.projectArchivedAt)}
                  archivedAt={project.projectArchivedAt}
                  restoring={restoringId === project.projectId}
                  onRestore={project.projectArchivedAt ? () => restore("projects", project.projectId) : undefined}
                  onRequestDelete={
                    project.projectArchivedAt
                      ? () => setConfirmDelete({ kind: "projects", id: project.projectId, title: project.projectTitle })
                      : undefined
                  }
                  c={c}
                  titleSize={17}
                />

                {project.outputs.map((o) => (
                  <div key={o.id} style={{ marginTop: 8, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                    <Row
                      label="Çıktı"
                      title={o.title}
                      archived
                      archivedAt={o.archivedAt}
                      restoring={restoringId === o.id}
                      onRestore={() => restore("outputs", o.id)}
                      onRequestDelete={() => setConfirmDelete({ kind: "outputs", id: o.id, title: o.title })}
                      c={c}
                    />
                  </div>
                ))}

                {project.topTasks.map((t) => (
                  <div key={t.id} style={{ marginTop: 8, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                    <Row
                      label="Görev"
                      title={t.title}
                      archived
                      archivedAt={t.archivedAt}
                      restoring={restoringId === t.id}
                      onRestore={() => restore("tasks", t.id)}
                      onRequestDelete={() => setConfirmDelete({ kind: "tasks", id: t.id, title: t.title })}
                      c={c}
                    />
                    {(project.subtasksByParent.get(t.id) ?? []).map((sub) => (
                      <div key={sub.id} style={{ marginTop: 6, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                        <Row
                          label="Alt görev"
                          title={sub.title}
                          archived
                          archivedAt={sub.archivedAt}
                          restoring={restoringId === sub.id}
                          onRestore={() => restore("tasks", sub.id)}
                          onRequestDelete={() => setConfirmDelete({ kind: "tasks", id: sub.id, title: sub.title })}
                          c={c}
                        />
                      </div>
                    ))}
                  </div>
                ))}

                {project.orphanSubtasks.map((sub) => (
                  <div key={sub.id} style={{ marginTop: 8, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                    <div style={{ fontSize: 13, color: c.textSecondary, marginBottom: 3 }}>
                      {sub.parentTaskTitle ?? "Üst görev"} içinde alt görev
                    </div>
                    <Row
                      label="Alt görev"
                      title={sub.title}
                      archived
                      archivedAt={sub.archivedAt}
                      restoring={restoringId === sub.id}
                      onRestore={() => restore("tasks", sub.id)}
                      onRequestDelete={() => setConfirmDelete({ kind: "tasks", id: sub.id, title: sub.title })}
                      c={c}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Kalıcı olarak sil"
          message={permanentDeleteMessage(confirmDelete.kind, confirmDelete.title)}
          confirmLabel="Kalıcı olarak sil"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handlePermanentDelete}
        />
      )}
    </div>
  );
}

function Row({
  label,
  title,
  archived,
  archivedAt,
  restoring,
  onRestore,
  onRequestDelete,
  c,
  titleSize = 16,
}: {
  label: string;
  title: string;
  archived: boolean;
  archivedAt?: string;
  restoring: boolean;
  onRestore?: () => void;
  onRequestDelete?: () => void;
  c: (typeof colors)["light"];
  titleSize?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 12,
              color: c.textSecondary,
              background: c.background,
              border: `1px solid ${c.border}`,
              borderRadius: 20,
              padding: "1px 7px",
              flexShrink: 0,
            }}
          >
            {label}
          </span>
          <span
            style={{
              fontSize: titleSize,
              fontWeight: archived ? 500 : 400,
              color: archived ? c.danger : c.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </span>
        </div>
        {archived && archivedAt && (
          <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>
            {new Date(archivedAt).toLocaleDateString("tr-TR")} tarihinde arşivlendi
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        {onRestore && (
          <button
            onClick={onRestore}
            disabled={restoring}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 7,
              padding: "5px 10px",
              fontSize: 15,
              color: c.textPrimary,
            }}
          >
            <IconRestore size={12} color={c.textPrimary} />
            {restoring ? "Getiriliyor…" : "Geri getir"}
          </button>
        )}

        {onRequestDelete && (
          <button
            onClick={onRequestDelete}
            aria-label={`${title} - kalıcı olarak sil`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              flexShrink: 0,
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 7,
              padding: "5px 10px",
              fontSize: 15,
              color: c.danger,
            }}
          >
            <IconTrash size={12} color={c.danger} />
            Sil
          </button>
        )}
      </div>
    </div>
  );
}
