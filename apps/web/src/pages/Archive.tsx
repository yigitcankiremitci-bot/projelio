import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ArchiveSummary, ArchivedTaskEntry, ThemeColors, Translate } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useRefreshOnUndo, useUndo } from "../lib/undo";
import { IconArchive, IconRestore, IconTrash } from "../components/icons";
import ConfirmDialog from "../components/ConfirmDialog";
import { useT } from "../lib/i18n";

type EntityKind = "jobs" | "projects" | "tasks" | "outputs";

// Çevirmen dışarıdan veriliyor: modül düzeyinde kanca çağrılamaz.
function permanentDeleteMessage(kind: EntityKind, title: string, t: Translate): string {
  switch (kind) {
    case "jobs":
      return t(
        '"{ad}" işini kalıcı olarak silmek istediğine emin misin? Bu işe bağlı tüm projeler, görevler ve çıktılar da kalıcı olarak silinecek. Bu işlem geri alınamaz.',
        { ad: title }
      );
    case "projects":
      return t(
        '"{ad}" projesini kalıcı olarak silmek istediğine emin misin? Bu projeye bağlı tüm görevler, alt görevler ve çıktılar da kalıcı olarak silinecek. Bu işlem geri alınamaz.',
        { ad: title }
      );
    case "tasks":
      return t(
        '"{ad}" görevini kalıcı olarak silmek istediğine emin misin? Varsa bu göreve bağlı alt görevler de kalıcı olarak silinecek. Bu işlem geri alınamaz.',
        { ad: title }
      );
    case "outputs":
      return t('"{ad}" çıktısını kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz.', { ad: title });
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
  const c = useThemeColors();
  const t = useT();
  const [data, setData] = useState<ArchiveSummary | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ kind: EntityKind; id: string; title: string } | null>(null);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const { pushDestructive } = useUndo();

  const reload = () => {
    api.get<ArchiveSummary>("/archive").then(setData).catch(() => setData(null));
  };

  useEffect(reload, []);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(reload);

  const restore = async (kind: EntityKind, id: string) => {
    setRestoringId(id);
    try {
      await api.patch(`/${kind}/${id}/restore`, {});
      reload();
    } finally {
      setRestoringId(null);
    }
  };

  // Kalıcı silme birkaç saniye geciktirilir: liste hemen tazelenmez, istek
  // gitmeden önce Cmd/Ctrl+Z ile vazgeçilebilir (bkz. lib/undo.tsx).
  const handlePermanentDelete = async () => {
    if (!confirmDelete) return;
    const { kind, id } = confirmDelete;
    setConfirmDelete(null);
    setPendingDeleteIds((prev) => [...prev, id]);
    pushDestructive({
      label: t("Kalıcı silme"),
      commit: async () => {
        await api.delete(`/${kind}/${id}`).catch(() => {});
        setPendingDeleteIds((prev) => prev.filter((x) => x !== id));
        reload();
      },
      restore: () => setPendingDeleteIds((prev) => prev.filter((x) => x !== id)),
    });
  };

  // Silinmesi bekleyen kayıtlar listede gösterilmez; geri alınırsa yeniden belirir.
  const visibleData: ArchiveSummary | null = data && {
    ...data,
    jobs: data.jobs.filter((j) => !pendingDeleteIds.includes(j.id)),
    projects: data.projects.filter((p) => !pendingDeleteIds.includes(p.id)),
    tasks: data.tasks.filter((t) => !pendingDeleteIds.includes(t.id)),
    outputs: data.outputs.filter((o) => !pendingDeleteIds.includes(o.id)),
  };

  const isEmpty =
    visibleData &&
    visibleData.jobs.length === 0 &&
    visibleData.projects.length === 0 &&
    visibleData.tasks.length === 0 &&
    visibleData.outputs.length === 0;

  const groups = visibleData ? buildGroups(visibleData) : [];

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <Link to="/settings" style={{ fontSize: 15, color: c.textSecondary, display: "inline-block", marginBottom: 14 }}>
        {t("← Ayarlar")}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <IconArchive size={20} color={c.textPrimary} />
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Arşiv")}</h1>
      </div>

      {!data && <p style={{ fontSize: 16, color: c.textSecondary }}>{t("Yükleniyor…")}</p>}

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
          {t(
            "Arşivde henüz bir şey yok. Sildiğin yerine arşive eklediğin işler, projeler, görevler ve çıktılar burada görünecek."
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
        {groups.map((job) => (
          <div key={job.jobId} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
            <Row
              label={t("İş")}
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
                  label={t("Proje")}
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
                      label={t("Çıktı")}
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

                {project.topTasks.map((gorev) => (
                  <div key={gorev.id} style={{ marginTop: 8, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                    <Row
                      label={t("Görev")}
                      title={gorev.title}
                      archived
                      archivedAt={gorev.archivedAt}
                      restoring={restoringId === gorev.id}
                      onRestore={() => restore("tasks", gorev.id)}
                      onRequestDelete={() => setConfirmDelete({ kind: "tasks", id: gorev.id, title: gorev.title })}
                      c={c}
                    />
                    {(project.subtasksByParent.get(gorev.id) ?? []).map((sub) => (
                      <div key={sub.id} style={{ marginTop: 6, marginLeft: 16, paddingLeft: 14, borderLeft: `2px solid ${c.border}` }}>
                        <Row
                          label={t("Alt görev")}
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
                      {t("{ust} içinde alt görev", { ust: sub.parentTaskTitle ?? t("Üst görev") })}
                    </div>
                    <Row
                      label={t("Alt görev")}
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
          title={t("Kalıcı olarak sil")}
          message={permanentDeleteMessage(confirmDelete.kind, confirmDelete.title, t)}
          confirmLabel={t("Kalıcı olarak sil")}
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
  c: ThemeColors;
  titleSize?: number;
}) {
  const t = useT();
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
            {t("{tarih} tarihinde arşivlendi", { tarih: new Date(archivedAt).toLocaleDateString("tr-TR") })}
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
            {restoring ? t("Getiriliyor…") : t("Geri getir")}
          </button>
        )}

        {onRequestDelete && (
          <button
            onClick={onRequestDelete}
            aria-label={t("{ad} - kalıcı olarak sil", { ad: title })}
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
            {t("Sil")}
          </button>
        )}
      </div>
    </div>
  );
}
