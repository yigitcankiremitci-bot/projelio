import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ProjectFile } from "@projelio/shared";
import { fileLinksApi, filesApi, type LinkedItems, type LinkTargetKind } from "../api/files";
import { driveEditUrl, driveProviderLabel, fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useFileThumbnails } from "../lib/fileThumbnails";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import FileContextMenu from "./FileContextMenu";
import FilePreviewModal from "./FilePreviewModal";
import FileThumb from "./FileThumb";
import { IconExternalLink, IconFolder, IconX } from "./icons";

interface Props {
  targetKind: LinkTargetKind;
  targetId: string;
  /** Başlık gizlenebilir: bazı ekranlarda kendi başlığının altına giriyor. */
  title?: string;
  /** Bağlantıyı koparma yetkisi olmayan ekranlarda (salt okunur) kapatılır. */
  canUnlink?: boolean;
}

/**
 * Bir göreve / kişiye / modül kaydına BAĞLI dosyalar (bkz. migration 095).
 *
 * FilesPanel'den ayrı, çünkü buradaki dosyalar bu ekrana AİT DEĞİL: başka bir
 * klasörde yaşıyorlar ve buraya yalnızca iliştirilmişler. Yükleme, klasör,
 * taşıma gibi sahiplik işleri burada yok — olsaydı kullanıcı dosyayı bu
 * ekrandan silebileceğini sanırdı, oysa "kaldır" yalnızca bağlantıyı koparır.
 *
 * Liste boşsa hiçbir şey çizmiyor: bağlı dosyası olmayan her görev modalinde
 * boş bir "Bağlı dosyalar" başlığı durması, ekranı bilgi taşımayan bir satırla
 * doldurmaktı.
 */
export default function LinkedFilesPanel({ targetKind, targetId, title, canUnlink = true }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [items, setItems] = useState<LinkedItems>({ files: [], folders: [] });
  const [preview, setPreview] = useState<ProjectFile | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; file: ProjectFile } | null>(null);
  const [error, setError] = useState("");
  const thumbs = useFileThumbnails(items.files);

  const load = useCallback(() => {
    if (!targetId) return;
    fileLinksApi
      .forTarget(targetKind, targetId)
      // Bağlı liste kritik değil: alınamazsa bölüm hiç çizilmez.
      .then(setItems)
      .catch(() => setItems({ files: [], folders: [] }));
  }, [targetKind, targetId]);

  useEffect(load, [load]);

  const koparDosya = async (file: ProjectFile) => {
    try {
      await fileLinksApi.unlink({ fileId: file.id }, targetKind, targetId);
      setItems((prev) => ({ ...prev, files: prev.files.filter((f) => f.id !== file.id) }));
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı koparılamadı"));
    }
  };

  const koparKlasor = async (folderId: string) => {
    try {
      await fileLinksApi.unlink({ folderId }, targetKind, targetId);
      setItems((prev) => ({ ...prev, folders: prev.folders.filter((f) => f.id !== folderId) }));
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı koparılamadı"));
    }
  };

  const indir = async (file: ProjectFile) => {
    try {
      window.location.href = await filesApi.contentUrl(file.id, { download: true });
    } catch (e: any) {
      setError(e?.message ?? t("Dosya indirilemedi"));
    }
  };

  if (!items.files.length && !items.folders.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, marginBottom: 8 }}>
        {title ?? t("Bağlı dosyalar")}
      </div>

      {error && <div style={{ color: c.danger, fontSize: 13, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/*
          Klasörler önce: bir görevin "bütün belgeleri" çoğu zaman tek tek
          dosyalar değil bir klasör, ve o klasör listenin dibinde aranmamalı.

          Satır Projelio İÇİNE gidiyor, buluta değil: bulut adresi kullanıcıyı
          uygulamadan çıkarır ve Drive izni olmayan (ama Projelio erişimi olan)
          bir üyede hiç açılmaz.
        */}
        {items.folders.map((folder) => (
          <div
            key={folder.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 9,
              border: `1px solid ${c.border}`,
              background: c.surface,
            }}
          >
            <Link
              to={folder.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
              }}
            >
              <IconFolder size={18} color={c.accent} />
              <span
                style={{
                  fontSize: 14,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {folder.name}
              </span>
            </Link>
            {canUnlink && (
              <button
                type="button"
                title={t("Bağlantıyı kopar")}
                onClick={() => void koparKlasor(folder.id)}
                style={ikonDugmesi(c.border)}
              >
                <IconX size={14} color={c.textSecondary} />
              </button>
            )}
          </div>
        ))}

        {items.files.map((file) => (
          <div
            key={file.id}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ x: e.clientX, y: e.clientY, file });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 10px",
              borderRadius: 9,
              border: `1px solid ${c.border}`,
              background: c.surface,
            }}
          >
            <div
              onClick={() => setPreview(file)}
              style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: "pointer" }}
            >
              <FileThumb file={file} thumbs={thumbs} variant="row" size={28} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    color: file.status === "missing" ? c.danger : c.textPrimary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {file.name}
                </div>
                <div style={{ fontSize: 12, color: c.textSecondary }}>
                  {[fileKindLabel(file), file.sizeBytes ? formatFileSize(file.sizeBytes) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>

            <button
              type="button"
              title={t("{saglayici}'da aç", { saglayici: driveProviderLabel(file) })}
              onClick={() => window.open(driveEditUrl(file), "_blank", "noopener,noreferrer")}
              style={ikonDugmesi(c.border)}
            >
              <IconExternalLink size={14} color={c.textSecondary} />
            </button>
            {canUnlink && (
              <button
                type="button"
                // "Sil" DEĞİL: dosya yerinde kalıyor, yalnızca buradaki
                // bağlantısı kopuyor. Etiket bunu açıkça söylemeli.
                title={t("Bağlantıyı kopar")}
                onClick={() => void koparDosya(file)}
                style={ikonDugmesi(c.border)}
              >
                <IconX size={14} color={c.textSecondary} />
              </button>
            )}
          </div>
        ))}
      </div>

      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: t("Önizle"), onClick: () => setPreview(menu.file) },
            { label: t("İndir"), onClick: () => void indir(menu.file) },
            {
              label: t("{saglayici}'da aç", { saglayici: driveProviderLabel(menu.file) }),
              onClick: () => window.open(driveEditUrl(menu.file), "_blank", "noopener,noreferrer"),
            },
            ...(canUnlink
              ? [{ label: t("Bağlantıyı kopar"), danger: true, onClick: () => void koparDosya(menu.file) }]
              : []),
          ]}
        />
      )}

      {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function ikonDugmesi(border: string): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 7,
    border: `1px solid ${border}`,
    background: "transparent",
    cursor: "pointer",
    flexShrink: 0,
  };
}
