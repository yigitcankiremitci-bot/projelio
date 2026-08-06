import { colors } from "../theme/colors";
import { IconCheck, IconCopy, IconMove, IconX } from "./icons";

interface Props {
  selectionMode: boolean;
  selectedCount: number;
  busy?: boolean;
  onEnable: () => void;
  onCancel: () => void;
  onDuplicate: () => void;
  onMove: () => void;
}

// Görev sütunlarının üstünde gösterilen seçim araç çubuğu: kapalıyken tek bir
// "Seç" düğmesi, açıkken seçili sayı + Çoğalt/Taşı/Vazgeç eylemleri. Hem tek bir
// görevi işaretleyip hem de birden fazlasını seçip aynı eylemleri uygulamak için
// aynı arayüz kullanılır (bkz. useTaskSelection, TaskColumn selectionMode).
export default function TaskSelectionBar({
  selectionMode,
  selectedCount,
  busy,
  onEnable,
  onCancel,
  onDuplicate,
  onMove,
}: Props) {
  const c = colors.light;

  if (!selectionMode) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button
          type="button"
          onClick={onEnable}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.textSecondary,
            fontSize: 13,
          }}
        >
          <IconCheck size={13} color={c.textSecondary} />
          Seç
        </button>
      </div>
    );
  }

  const disabled = selectedCount === 0 || busy;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 10,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <span style={{ fontSize: 14, color: c.textPrimary, fontWeight: 500 }}>
        {selectedCount > 0 ? `${selectedCount} görev seçili` : "Görev seç"}
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onDuplicate}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 11px",
            borderRadius: 7,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 13,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <IconCopy size={13} color={c.textSecondary} />
          Çoğalt
        </button>
        <button
          type="button"
          onClick={onMove}
          disabled={disabled}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 11px",
            borderRadius: 7,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textPrimary,
            fontSize: 13,
            opacity: disabled ? 0.5 : 1,
            cursor: disabled ? "default" : "pointer",
          }}
        >
          <IconMove size={13} color={c.textSecondary} />
          Taşı
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 11px",
            borderRadius: 7,
            border: "none",
            background: "transparent",
            color: c.textSecondary,
            fontSize: 13,
          }}
        >
          <IconX size={13} color={c.textSecondary} />
          Vazgeç
        </button>
      </div>
    </div>
  );
}
