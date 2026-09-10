import { useCallback, useEffect, useState } from "react";
import type { ProjectFile } from "@projelio/shared";
import { fileLinksApi, type LinkBrowse, type LinkTargetKind } from "../api/files";
import { fileKindLabel, formatFileSize } from "../lib/driveLinks";
import { useFileThumbnails } from "../lib/fileThumbnails";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import FileThumb from "./FileThumb";
import Modal from "./Modal";
import { IconCheck, IconChevronLeft, IconFolder } from "./icons";

interface Props {
  targetKind: LinkTargetKind;
  targetId: string;
  onClose: () => void;
  onLinked: () => void;
}

const BOS: LinkBrowse = { folders: [], files: [], breadcrumb: [] };

/**
 * "Dosya seç": hedefin kendi modalinden çıkmadan işin/şirketin klasör ağacına
 * bakıp dosya bağlamak.
 *
 * NEDEN TERS YÖNDE BİR AKIŞ GEREKLİ: bağlama şimdiye kadar yalnızca dosyalar
 * sayfasından başlıyordu. Kullanıcı görev modalindeyken dosya iliştirmek
 * istediğinde modaldan çıkıp dosyalar sekmesine gidiyor, dosyayı buluyor ve
 * orada hangi göreve bağlayacağını yeniden aramak zorunda kalıyordu —
 * bildiği şeyi (hangi görev) unutup bilmediğini (dosya nerede) aramak.
 *
 * Gezilen ağacın KAPSAMI sunucuda hedeften çıkıyor, istemciden gelmiyor:
 * aksi hâlde bir görev modalinden başka bir şirketin klasörü gezilebilirdi.
 */
export default function PickLinkedFilesModal({ targetKind, targetId, onClose, onLinked }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<LinkBrowse>(BOS);
  const [loading, setLoading] = useState(true);
  const [secili, setSecili] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const thumbs = useFileThumbnails(data.files);

  const load = useCallback(() => {
    setLoading(true);
    fileLinksApi
      .browse(targetKind, targetId, folderId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [targetKind, targetId, folderId]);

  useEffect(load, [load]);

  const topluBagla = async () => {
    if (!secili.length) return;
    setBusy(true);
    setError("");
    try {
      for (const fileId of secili) await fileLinksApi.link({ fileId }, targetKind, targetId);
      onLinked();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? t("Bağlanamadı"));
    } finally {
      setBusy(false);
    }
  };

  const secimiDegistir = (id: string) =>
    setSecili((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Bir üst klasör; kırıntının sondan ikincisi (kök ise undefined).
  const ustKlasor = data.breadcrumb.length > 1 ? data.breadcrumb[data.breadcrumb.length - 2].id : undefined;

  return (
    <Modal title={t("Dosya seç")} onClose={onClose} maxWidth={520}>
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px" }}>
        {t("Dosya yerinde kalır; buraya da bağlanır.")}
      </p>

      {/* Ekmek kırıntısı + geri: klasöre girip çıkmanın tek yolu bu pencerede. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10, fontSize: 14 }}>
        {folderId && (
          <button
            type="button"
            onClick={() => setFolderId(ustKlasor)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "transparent",
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              color: c.textPrimary,
              cursor: "pointer",
              padding: "3px 9px 3px 6px",
              fontSize: 13,
            }}
          >
            <IconChevronLeft size={13} color={c.textSecondary} />
            {t("Geri")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setFolderId(undefined)}
          style={{ background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 14 }}
        >
          {t("Dosyalar")}
        </button>
        {data.breadcrumb.map((k) => (
          <span key={k.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: c.textSecondary }}>/</span>
            <button
              type="button"
              onClick={() => setFolderId(k.id)}
              style={{ background: "transparent", border: "none", color: c.accent, cursor: "pointer", padding: 0, fontSize: 14 }}
            >
              {k.name}
            </button>
          </span>
        ))}
      </div>

      {error && <div style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{error}</div>}

      <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
        {loading ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
        ) : !data.folders.length && !data.files.length ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Bu klasör boş.")}</div>
        ) : (
          <>
            {data.folders.map((klasor) => (
              <button
                key={klasor.id}
                type="button"
                onClick={() => setFolderId(klasor.id)}
                style={satirStili(c.border, false)}
              >
                <IconFolder size={18} color={c.accent} />
                <span style={{ flex: 1, fontSize: 15, color: c.textPrimary, textAlign: "left" }}>{klasor.name}</span>
                <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Klasör")}</span>
              </button>
            ))}

            {data.files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => secimiDegistir(file.id)}
                style={satirStili(secili.includes(file.id) ? c.accent : c.border, secili.includes(file.id))}
              >
                <SecimKutusu isaretli={secili.includes(file.id)} />
                <FileThumb file={file} thumbs={thumbs} variant="row" size={28} />
                <span style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 15,
                      color: c.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.name}
                  </span>
                  <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>
                    {[fileKindLabel(file), file.sizeBytes ? formatFileSize(file.sizeBytes) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          data-primary
          onClick={topluBagla}
          disabled={busy || !secili.length}
          style={{
            flex: 1,
            padding: "9px 0",
            borderRadius: 9,
            border: "none",
            background: secili.length ? c.primary : c.border,
            color: secili.length ? c.onPrimary : c.textSecondary,
            fontSize: 15,
            cursor: secili.length ? "pointer" : "not-allowed",
          }}
        >
          {secili.length > 1 ? t("{sayi} dosyayı bağla", { sayi: secili.length }) : t("Bağla")}
        </button>
        <button onClick={onClose} disabled={busy} style={{ padding: "9px 16px", fontSize: 15 }}>
          {t("Vazgeç")}
        </button>
      </div>
    </Modal>
  );
}

function satirStili(border: string, secili: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    borderRadius: 9,
    border: `1px solid ${border}`,
    background: secili ? `${border}14` : "transparent",
    cursor: "pointer",
  };
}

function SecimKutusu({ isaretli }: { isaretli: boolean }) {
  const c = useThemeColors();
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 4,
        flexShrink: 0,
        border: isaretli ? "none" : `1.5px solid ${c.border}`,
        background: isaretli ? c.accent : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isaretli && <IconCheck size={10} color="#fff" />}
    </span>
  );
}
