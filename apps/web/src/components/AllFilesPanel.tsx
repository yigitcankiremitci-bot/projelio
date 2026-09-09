import { useEffect, useMemo, useState } from "react";
import type { Job, Project, ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import { driveEditUrl, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useFileThumbnails } from "../lib/fileThumbnails";
import { useProjectFabAction } from "../lib/projectFab";
import { usePageFileDrop } from "../lib/usePageFileDrop";
import { useThemeColors } from "../theme/useThemeColors";
import FilePreviewModal from "./FilePreviewModal";
import FileThumb from "./FileThumb";
import QuickFileUploadModal, { type UploadTargetOption } from "./QuickFileUploadModal";
import { IconDownload, IconExternalLink } from "./icons";
import { useT } from "../lib/i18n";

/**
 * İşlerim sayfasındaki "Dosyalar" sekmesi: kullanıcının erişebildiği TÜM işlerin
 * dosyalarını tek listede gösterir.
 *
 * Liste birden fazla işi birleştirdiği için tek bir yükleme bağlamı yok; bu yüzden
 * uzun süre salt okunurdu ve "+" düğmesi anasayfanın varsayılanı olan "Yeni iş"i
 * açıyordu. Yalnızca proje düzeyinde erişimi olan kullanıcı (örn. taşeron) buradan
 * hiç dosya ekleyemiyordu. Artık "+" bir hedef seçtiren yükleme modalini açıyor.
 */
interface Props {
  jobs: Job[];
  /** Kullanıcının erişebildiği projeler — yükleme hedefi listesi için. */
  projects: Project[];
  myUserId: string | null;
}

export default function AllFilesPanel({ jobs, projects, myUserId }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [adding, setAdding] = useState(false);
  // Sürükleyip bırakılan dosyalar: hedefi kullanıcı pencerede seçecek.
  const [dropped, setDropped] = useState<File[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // İşin geneline yükleme yalnızca iş ekibine açık (bkz. backend files.service.ts
  // assertContextAllowed). İş sahibi her zaman iş düzeyindedir; diğerleri için
  // seçeneği göstermiyoruz ki tıklayınca 403 almasınlar — asıl kısıt yine sunucuda.
  const uploadTargets = useMemo<UploadTargetOption[]>(() => {
    const out: UploadTargetOption[] = [];
    const listed = new Set<string>();

    for (const job of jobs) {
      listed.add(job.id);
      if (myUserId && job.ownerId === myUserId) {
        out.push({ id: `job:${job.id}`, label: "İş geneli", group: job.title, target: { jobId: job.id } });
      }
      for (const p of projects.filter((pr) => pr.jobId === job.id)) {
        out.push({ id: `project:${p.id}`, label: p.title, group: job.title, target: { projectId: p.id } });
      }
    }

    // İşi listede olmayan projeler (örn. iş kartı gizlenmiş) kaybolmasın.
    for (const p of projects.filter((pr) => !listed.has(pr.jobId))) {
      out.push({ id: `project:${p.id}`, label: p.title, group: "Diğer", target: { projectId: p.id } });
    }

    return out;
  }, [jobs, projects, myUserId]);

  /**
   * Bu liste birden çok işi birleştiriyor, yani bırakılan dosyanın hedefi
   * belirsiz. Bu yüzden bırakma doğrudan yüklemiyor: dosyaları tutup "nereye?"
   * penceresini açıyoruz — kullanıcı yine sürükleyip bırakabiliyor, tek fark
   * bir seçim adımı.
   */
  // Klasör bırakılırsa ağaçtaki dosyalar düz listeye açılır (bkz. lib/dropFiles.ts);
  // hedef seçimi yapıldıktan sonra klasör yapısını sunucu kuruyor.
  const { dragging } = usePageFileDrop(uploadTargets.length > 0, (dosyalar) =>
    setDropped(dosyalar.map((d) => d.file))
  );

  const thumbs = useFileThumbnails(files);


  useProjectFabAction({ label: "Dosya ekle", onClick: () => setAdding(true) }, []);

  useEffect(() => {
    if (jobs.length === 0) {
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all(
      jobs.map((job) =>
        filesApi
          .listByJob(job.id, { scope: "all" })
          // Bir işin dosyaları çekilemese bile (erişim, ağ vb.) diğerleri listelenmeye devam etsin.
          .then((list) => list.map((f) => ({ ...f, jobTitle: f.jobTitle ?? job.title })))
          .catch(() => [] as ProjectFile[])
      )
    )
      .then((lists) => {
        if (cancelled) return;
        const merged = lists.flat().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setFiles(merged);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [jobs, reloadKey]);

  const handleDownload = async (file: ProjectFile) => {
    try {
      window.location.href = await filesApi.contentUrl(file.id, { download: true });
    } catch (e: any) {
      setError(e?.message ?? "Dosya indirilemedi");
    }
  };

  // Modal her durumda render edilmeli: dosya yokken de "+" ile yükleme yapılabilsin.
  // (Eskiden boş durumda erken return vardı; taşeronun gördüğü ekran tam da buydu.)
  const body = loading ? (
    <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
  ) : error ? (
    <div style={{ color: c.danger, fontSize: 15 }}>{error}</div>
  ) : files.length === 0 ? (
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
      {t("Henüz dosya yok.")}
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {files.map((file) => (
        <div
          key={file.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "11px 14px",
            borderRadius: 10,
            border: `1px solid ${c.border}`,
            background: c.surface,
          }}
        >
          <div
            onClick={() => setPreview(file)}
            style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, cursor: "pointer" }}
          >
            <FileThumb file={file} thumbs={thumbs} variant="row" />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  color: file.status === "missing" ? c.danger : c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </div>
              <div style={{ fontSize: 13, color: c.textSecondary }}>
                {file.status === "missing"
                  ? "Drive'da bulunamadı"
                  : [file.jobTitle, fileKindLabel(file), file.sizeBytes ? formatFileSize(file.sizeBytes) : null]
                      .filter(Boolean)
                      .join(" · ")}
              </div>
            </div>
          </div>

          <IconButton title={t("İndir")} onClick={() => void handleDownload(file)}>
            <IconDownload size={16} color={c.textSecondary} />
          </IconButton>
          <IconButton
            title={t("Drive'da düzenle")}
            onClick={() => window.open(driveEditUrl(file), "_blank", "noopener,noreferrer")}
          >
            <IconExternalLink size={16} color={c.textSecondary} />
          </IconButton>
        </div>
      ))}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );

  return (
    <>
      {body}

      {/* Sayfaya bırakılan dosya için tam sayfa gösterge (bkz. FilesPanel'deki eşi). */}
      {dragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 900,
            pointerEvents: "none",
            background: "rgba(192,129,63,0.10)",
            border: `2px dashed ${c.accent}`,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              padding: "12px 20px",
              borderRadius: 10,
              background: c.surface,
              border: `1px solid ${c.border}`,
              color: c.textPrimary,
              fontSize: 16,
            }}
          >
            {t("Bırakın, nereye ekleneceğini soralım")}
          </div>
        </div>
      )}

      {(adding || dropped.length > 0) && (
        <QuickFileUploadModal
          targets={uploadTargets}
          pickerLabel="Nereye"
          emptyMessage="Dosya yükleyebilmek için önce bir işe ya da projeye eklenmen gerekiyor."
          pendingFiles={dropped.length ? dropped : undefined}
          onClose={() => {
            setAdding(false);
            setDropped([]);
          }}
          onUploaded={() => {
            setAdding(false);
            setDropped([]);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const c = useThemeColors();
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        border: `1px solid ${c.border}`,
        background: "transparent",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}
