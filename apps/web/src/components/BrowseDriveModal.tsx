import { useEffect, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import type { DriveBrowseEntry } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconChevronRight, IconFile, IconFolder } from "./icons";

interface Props {
  target: { jobId: string } | { projectId: string } | { departmentId: string };
  taskId?: string;
  outputId?: string;
  onClose: () => void;
  onImported: (file: ProjectFile) => void;
}

interface Crumb {
  id?: string;
  name: string;
}

/**
 * OneDrive'ın kendi Drive'ında gezinip mevcut bir dosyayı Projelio'ya "çekmek"
 * için özel arayüz — Google tarafında bunun karşılığı yok, orada resmi Picker
 * widget'ı açılır (bkz. lib/googlePicker.ts). Bu modal yalnızca provider
 * "microsoft" olduğunda açılır (bkz. FilesPanel.tsx).
 */
export default function BrowseDriveModal({ target, taskId, outputId, onClose, onImported }: Props) {
  const c = useThemeColors();
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: undefined, name: "OneDrive" }]);
  const [entries, setEntries] = useState<DriveBrowseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  const currentFolderId = crumbs[crumbs.length - 1]?.id;

  useEffect(() => {
    setLoading(true);
    setError("");
    filesApi
      .browse(target, currentFolderId)
      .then((res) => setEntries(res.entries))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [target, currentFolderId]);

  const openFolder = (entry: DriveBrowseEntry) => {
    setCrumbs((prev) => [...prev, { id: entry.id, name: entry.name }]);
  };

  const goToCrumb = (index: number) => {
    setCrumbs((prev) => prev.slice(0, index + 1));
  };

  const importEntry = async (entry: DriveBrowseEntry) => {
    setError("");
    setImportingId(entry.id);
    try {
      const created = await filesApi.importFromDrive(target, { sourceFileId: entry.id, taskId, outputId });
      onImported(created);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Dosya içe aktarılamadı");
      setImportingId(null);
    }
  };

  return (
    <Modal title="OneDrive'dan seç" onClose={onClose} maxWidth={480}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, marginBottom: 12 }}>
        {crumbs.map((crumb, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <IconChevronRight size={13} color={c.textSecondary} />}
            <button
              onClick={() => goToCrumb(i)}
              disabled={i === crumbs.length - 1}
              style={{
                background: "transparent",
                border: "none",
                padding: "2px 4px",
                fontSize: 14,
                color: i === crumbs.length - 1 ? c.textPrimary : c.primary,
                fontWeight: i === crumbs.length - 1 ? 500 : 400,
                cursor: i === crumbs.length - 1 ? "default" : "pointer",
              }}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {error && <p style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{error}</p>}

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : entries.length === 0 ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Bu klasör boş.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 360, overflowY: "auto" }}>
          {entries.map((entry) => (
            <button
              key={entry.id}
              onClick={() => (entry.isFolder ? openFolder(entry) : void importEntry(entry))}
              disabled={importingId !== null}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                border: "none",
                background: "transparent",
                textAlign: "left",
                cursor: importingId !== null ? "wait" : "pointer",
                width: "100%",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = c.background)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {entry.isFolder ? (
                <IconFolder size={17} color={c.textSecondary} />
              ) : entry.iconLink ? (
                <img src={entry.iconLink} alt="" width={17} height={17} />
              ) : (
                <IconFile size={17} color={c.textSecondary} />
              )}
              <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </span>
              {importingId === entry.id && (
                <span style={{ fontSize: 13, color: c.textSecondary }}>İçe aktarılıyor…</span>
              )}
              {entry.isFolder && <IconChevronRight size={14} color={c.textSecondary} />}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
