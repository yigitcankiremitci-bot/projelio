import { colors } from "../theme/colors";
import { IconArchive, IconCheck, IconCopy, IconMove, IconTrash, IconX } from "./icons";

interface Props {
  selectionMode: boolean;
  selectedCount: number;
  busy?: boolean;
  onEnable: () => void;
  onCancel: () => void;
  /**
   * Çoğalt/Taşı/Arşivle/Sil düğmelerinin tümü opsiyonel: yalnızca verilenler
   * gösterilir. Gerçek işlemi bu bileşen yapmaz — çağıran taraf onay modalını
   * (bkz. ConfirmDialog) açıp gerçek toplu isteği kendisi yapar. Bazı panolarda
   * (ör. Yapılacaklar sayfası, kişisel + atanan görevleri tek listede karıştırır)
   * Çoğalt/Taşı'nın karşılığı yoktur, o yüzden onlar da opsiyonel.
   */
  onDuplicate?: () => void;
  onMove?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
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
  onArchive,
  onDelete,
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
            gap: 7,
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: c.surface,
            color: c.textSecondary,
            fontSize: 15,
          }}
        >
        <IconCheck size={15} color={c.textSecondary} />
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
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      <span style={{ fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>
        {selectedCount > 0 ? `${selectedCount} görev seçili` : "Görev seç"}
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {onDuplicate && (
          <button
            type="button"
            onClick={onDuplicate}
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              fontSize: 14,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <IconCopy size={14} color={c.textSecondary} />
            Çoğalt
          </button>
        )}
        {onMove && (
          <button
            type="button"
            onClick={onMove}
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              fontSize: 14,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <IconMove size={14} color={c.textSecondary} />
            Taşı
          </button>
        )}
        {onArchive && (
          <button
            type="button"
            onClick={onArchive}
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 7,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textPrimary,
              fontSize: 14,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <IconArchive size={14} color={c.textSecondary} />
            Arşivle
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={disabled}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 7,
              border: `1px solid ${c.danger}`,
              background: "transparent",
              color: c.danger,
              fontSize: 14,
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? "default" : "pointer",
            }}
          >
            <IconTrash size={14} color={c.danger} />
            Sil
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderRadius: 7,
            border: "none",
            background: "transparent",
            color: c.textSecondary,
            fontSize: 14,
          }}
        >
          <IconX size={14} color={c.textSecondary} />
          Vazgeç
        </button>
      </div>
    </div>
  );
}
