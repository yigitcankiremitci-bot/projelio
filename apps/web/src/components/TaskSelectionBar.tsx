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
  /**
   * Panolardaki tek satırlık araç çubuğunun içine yerleşmek için: kapalıyken
   * yalnızca "Seç" düğmesi döner (kendi satırını açmaz), açıkken tam genişlikte
   * bar olarak bir alt satıra kayar — o halde sayaç ve eylemler için yer gerekiyor.
   * Çağıran, kapsayıcısını `display: flex; flex-wrap: wrap` yapmalıdır.
   */
  inline?: boolean;
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
  inline,
}: Props) {
  const c = colors.light;

  if (!selectionMode) {
    const enableButton = (
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
    );
    if (inline) return enableButton;
    return <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>{enableButton}</div>;
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
        // Satır içi kullanımda tam genişlik alıp bir alt satıra kayar: sayaç ve
        // eylemler araç çubuğunun yanına sığmaz.
        flexBasis: inline ? "100%" : undefined,
        marginBottom: inline ? 0 : 10,
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
