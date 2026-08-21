import { useEffect, useState } from "react";
import type { Job, ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import { driveEditUrl, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useThemeColors } from "../theme/useThemeColors";
import FilePreviewModal from "./FilePreviewModal";
import { IconDownload, IconExternalLink, IconFile } from "./icons";

/**
 * İşlerim sayfasındaki "Dosyalar" sekmesi: kullanıcının erişebildiği TÜM işlerin
 * dosyalarını tek listede gösterir. Dosyalar her zaman bir işe ait olduğu için
 * (bkz. files.ts) burada yükleme/silme yok, salt okunur bir genel bakış — tıpkı
 * organizasyon/grup ekranlarındaki dosya listesi gibi.
 */
interface Props {
  jobs: Job[];
}

export default function AllFilesPanel({ jobs }: Props) {
  const c = useThemeColors();
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ProjectFile | null>(null);

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
  }, [jobs]);

  const handleDownload = async (file: ProjectFile) => {
    try {
      window.location.href = await filesApi.contentUrl(file.id, { download: true });
    } catch (e: any) {
      setError(e?.message ?? "Dosya indirilemedi");
    }
  };

  if (loading) {
    return <div style={{ color: c.textSecondary, fontSize: 15 }}>Yükleniyor…</div>;
  }

  if (error) {
    return <div style={{ color: c.danger, fontSize: 15 }}>{error}</div>;
  }

  if (files.length === 0) {
    return (
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
        Henüz dosya yok.
      </div>
    );
  }

  return (
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
            {file.iconLink ? (
              <img src={file.iconLink} alt="" width={18} height={18} />
            ) : (
              <IconFile size={18} color={c.textSecondary} />
            )}
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

          <IconButton title="İndir" onClick={() => void handleDownload(file)}>
            <IconDownload size={16} color={c.textSecondary} />
          </IconButton>
          <IconButton
            title="Drive'da düzenle"
            onClick={() => window.open(driveEditUrl(file), "_blank", "noopener,noreferrer")}
          >
            <IconExternalLink size={16} color={c.textSecondary} />
          </IconButton>
        </div>
      ))}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
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
