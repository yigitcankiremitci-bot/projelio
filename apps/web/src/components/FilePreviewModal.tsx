import { useEffect, useState } from "react";
import { Z } from "../lib/layout";
import { createPortal } from "react-dom";
import type { ProjectFile } from "@projelio/shared";
import { filesApi } from "../api/files";
import {
  canRenderLocally,
  driveEditUrl,
  drivePreviewUrl,
  driveProviderLabel,
  fileKindLabel,
  formatFileSize,
} from "../lib/driveLinks";
import { useThemeColors } from "../theme/useThemeColors";
import { IconDownload, IconExternalLink, IconX } from "./icons";

interface Props {
  file: ProjectFile;
  onClose: () => void;
  /** Kullanıcı Drive'da düzenleyip döndüğünde listeyi tazelemek için. */
  onMaybeChanged?: () => void;
}

export default function FilePreviewModal({ file, onClose, onMaybeChanged }: Props) {
  const c = useThemeColors();
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openedEditor, setOpenedEditor] = useState(false);

  const renderLocally = canRenderLocally(file);

  useEffect(() => {
    if (!renderLocally) return;
    let cancelled = false;
    filesApi
      .contentUrl(file.id)
      .then((url) => {
        if (!cancelled) setLocalUrl(url);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Önizleme yüklenemedi.");
      });
    return () => {
      cancelled = true;
    };
  }, [file.id, renderLocally]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Kullanıcı düzenleme sekmesinden geri döndüğünde listeyi tazele: dosyanın adı
  // veya içeriği değişmiş olabilir.
  useEffect(() => {
    if (!openedEditor) return;
    const onFocus = () => onMaybeChanged?.();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [openedEditor, onMaybeChanged]);

  const handleDownload = async () => {
    try {
      const url = await filesApi.contentUrl(file.id, { download: true });
      window.location.href = url;
    } catch {
      setLoadError("Dosya indirilemedi.");
    }
  };

  const handleEdit = () => {
    setOpenedEditor(true);
    window.open(driveEditUrl(file), "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,31,41,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: Z.filePreview,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 1000,
          height: "88vh",
          display: "flex",
          flexDirection: "column",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        {/* --- başlık çubuğu --- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 18px",
            borderBottom: `1px solid ${c.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: c.textPrimary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {file.name}
            </div>
            <div style={{ fontSize: 14, color: c.textSecondary }}>
              {fileKindLabel(file)}
              {file.sizeBytes ? ` · ${formatFileSize(file.sizeBytes)}` : ""}
            </div>
          </div>

          <button
            onClick={handleDownload}
            title="İndir"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textSecondary,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            <IconDownload size={16} color={c.textSecondary} />
            İndir
          </button>

          <button
            onClick={handleEdit}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <IconExternalLink size={16} color="#fff" />
            {driveProviderLabel(file)}'da düzenle
          </button>

          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{ background: "transparent", border: "none", padding: 6, display: "flex", cursor: "pointer" }}
          >
            <IconX size={18} color={c.textSecondary} />
          </button>
        </div>

        {/* --- içerik --- */}
        <div style={{ flex: 1, background: c.background, position: "relative" }}>
          {file.status === "missing" ? (
            <EmptyState
              title={`Dosya ${driveProviderLabel(file)}'da bulunamadı`}
              detail={`Dosya ${driveProviderLabel(file)} üzerinden silinmiş veya taşınmış olabilir.`}
            />
          ) : loadError ? (
            <EmptyState title="Önizleme açılamadı" detail={loadError} />
          ) : renderLocally ? (
            localUrl ? (
              file.mimeType.startsWith("image/") ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 20,
                  }}
                >
                  <img
                    src={localUrl}
                    alt={file.name}
                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                  />
                </div>
              ) : (
                <iframe
                  src={localUrl}
                  title={file.name}
                  style={{ width: "100%", height: "100%", border: "none" }}
                />
              )
            ) : (
              <EmptyState title="Yükleniyor…" detail="" />
            )
          ) : (
            // Google formatları ve diğer türler Drive'ın kendi önizleyicisiyle
            // gösterilir. Bu iframe yalnızca kullanıcının Google hesabının
            // klasöre erişimi varsa içerik gösterir.
            <>
              <iframe
                src={drivePreviewUrl(file)}
                title={file.name}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="autoplay"
              />
              {!file.canEditInDrive && (
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    bottom: 16,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: c.surface,
                    border: `1px solid ${c.border}`,
                    color: c.textSecondary,
                    fontSize: 14,
                  }}
                >
                  Önizleme boş görünüyorsa {driveProviderLabel(file)} hesabınız bu klasöre henüz
                  eklenmemiş olabilir. Ayarlar'dan {driveProviderLabel(file)}'ı bağlayın; dosyayı her
                  hâlükârda İndir ile açabilirsiniz.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 17, color: c.textPrimary }}>{title}</div>
      {detail && <div style={{ fontSize: 15, color: c.textSecondary, maxWidth: 420 }}>{detail}</div>}
    </div>
  );
}
