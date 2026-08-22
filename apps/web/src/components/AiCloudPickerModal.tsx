import { useEffect, useState } from "react";
import { aiChat } from "../api/aiChat";
import type { AiAttachment, AiCloudEntry } from "../api/aiChat";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconChevronRight, IconFile, IconFolder } from "./icons";

interface Props {
  conversationId?: string;
  onClose: () => void;
  onPicked: (attachment: AiAttachment) => void;
}

interface Crumb {
  id?: string;
  name: string;
}

/**
 * Lio'ya OneDrive'dan dosya seçme penceresi.
 *
 * Yalnızca OneDrive için: Google tarafında dosya seçimi tarayıcıdaki resmi Picker
 * widget'ıyla yapılıyor (bkz. lib/googlePicker.ts) — Projelio'nun dar `drive.file`
 * kapsamı Drive'ın tamamını listelemeye izin vermiyor.
 *
 * BrowseDriveModal'dan farkı: oradaki akış dosyayı Projelio'ya İÇE AKTARIR, burada
 * dosya yalnızca okunur ve sohbete iliştirilir; Projelio'ya kaydedilmez.
 */
export default function AiCloudPickerModal({ conversationId, onClose, onPicked }: Props) {
  const c = useThemeColors();
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: undefined, name: "OneDrive" }]);
  const [entries, setEntries] = useState<AiCloudEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pickingId, setPickingId] = useState<string | null>(null);

  const currentFolderId = crumbs[crumbs.length - 1]?.id;

  useEffect(() => {
    setLoading(true);
    setError("");
    aiChat
      .browseCloudFiles(currentFolderId)
      .then((res) => setEntries(res.entries))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [currentFolderId]);

  const pick = async (entry: AiCloudEntry) => {
    setError("");
    setPickingId(entry.id);
    try {
      const attachment = await aiChat.attachCloudFile(entry.id, conversationId);
      onPicked(attachment);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Dosya okunamadı.");
      setPickingId(null);
    }
  };

  return (
    <Modal title="OneDrive'dan seç" onClose={onClose} maxWidth={480}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10, fontSize: 12 }}>
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.id ?? "root"}-${index}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {index > 0 && <IconChevronRight size={12} color={c.textSecondary} />}
            <button
              type="button"
              onClick={() => setCrumbs((prev) => prev.slice(0, index + 1))}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: index === crumbs.length - 1 ? c.textPrimary : c.textSecondary,
                fontSize: 12,
              }}
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      {error && <p style={{ color: c.danger, fontSize: 13, margin: "0 0 10px" }}>{error}</p>}

      <div style={{ maxHeight: 340, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 10 }}>
        {loading ? (
          <p style={{ padding: 16, margin: 0, fontSize: 13, color: c.textSecondary }}>Yükleniyor…</p>
        ) : entries.length === 0 ? (
          <p style={{ padding: 16, margin: 0, fontSize: 13, color: c.textSecondary }}>Bu klasör boş.</p>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              disabled={!!pickingId}
              onClick={() =>
                entry.isFolder ? setCrumbs((prev) => [...prev, { id: entry.id, name: entry.name }]) : void pick(entry)
              }
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                borderBottom: `1px solid ${c.border}`,
                cursor: pickingId ? "default" : "pointer",
                textAlign: "left",
                opacity: pickingId && pickingId !== entry.id ? 0.5 : 1,
              }}
            >
              {entry.isFolder ? (
                <IconFolder size={16} color={c.accent} />
              ) : (
                <IconFile size={16} color={c.textSecondary} />
              )}
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: c.textPrimary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.name}
              </span>
              {pickingId === entry.id && (
                <span style={{ fontSize: 12, color: c.textSecondary }}>okunuyor…</span>
              )}
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
