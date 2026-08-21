import type { CSSProperties, ReactNode } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import { IconArchive, IconCheck, IconCopy, IconMove, IconTrash, IconX } from "./icons";
import { LioMascotIcon } from "./AskLioButton";
import { askLioAboutMany } from "../lib/askLio";
import type { LioSubject } from "../lib/askLio";
import { useAppPrefs } from "../lib/appPrefs";

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
   * O an seçili görevler. Verilirse eylemlerin arasına "Lio'ya sor" düğmesi
   * girer ve seçilenlerin tamamı tek mesajda Lio'ya aktarılır
   * (bkz. lib/askLio.ts selectedLioTasks / askLioAboutMany).
   *
   * Diğer eylemlerin aksine burada onay modalı yok: sohbet kutusuna bir taslak
   * yazılır, hiçbir şey değişmez — göndermeye kullanıcı karar verir.
   */
  lioTasks?: LioSubject[];
  /**
   * Panolardaki tek satırlık araç çubuğunun (ve kaydırınca beliren sabit
   * şeridin) içine yerleşmek için.
   *
   * Bu modda seçim açılınca YENİ BİR SATIR AÇILMAZ: eylemler Sırala'nın yanında,
   * aynı satırda kalır. Sığması için de yazısız, yalnızca ikonlu düğmelere
   * indirgenir — dar ekranda "Çoğalt/Taşı/Arşivle/Sil/Vazgeç" yazılı hâlleri tek
   * satıra hiçbir şekilde sığmıyor, tam genişlikli bar da araç çubuğunu ikiye
   * bölüp Sırala'yı yukarıda yalnız bırakıyordu.
   *
   * Ne yaptıkları `title`/`aria-label` ile korunur.
   */
  inline?: boolean;
}

/**
 * Görev sütunlarının üstünde gösterilen seçim araç çubuğu: kapalıyken tek bir
 * "Seç" düğmesi, açıkken seçili sayı + Çoğalt/Taşı/Arşivle/Sil/Vazgeç. Hem tek
 * bir görevi işaretleyip hem de birden fazlasını seçip aynı eylemleri uygulamak
 * için aynı arayüz kullanılır (bkz. useTaskSelection, TaskColumn selectionMode).
 */
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
  lioTasks,
  inline,
}: Props) {
  const c = useThemeColors();
  const { showLio } = useAppPrefs();

  if (!selectionMode) {
    const enableButton = (
      <button
        type="button"
        onClick={onEnable}
        aria-label="Görev seçimini aç"
        title="Seç"
        style={{
          display: "flex",
          alignItems: "center",
          gap: inline ? 6 : 7,
          padding: inline ? "7px 13px" : "8px 16px",
          borderRadius: 8,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: c.textSecondary,
          fontSize: inline ? 14 : 15,
          whiteSpace: "nowrap",
          flexShrink: 0,
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

  /**
   * Tek bir eylem düğmesi. Satır içi kullanımda yazı düşer, geriye ikon kalır —
   * anlamı `title`/`aria-label` taşır.
   */
  const actionButton = (
    key: string,
    label: string,
    ariaLabel: string,
    icon: ReactNode,
    onClick: () => void,
    options: { danger?: boolean; borderless?: boolean; alwaysEnabled?: boolean } = {}
  ) => {
    const off = options.alwaysEnabled ? false : disabled;
    const border = options.borderless ? "none" : `1px solid ${options.danger ? c.danger : c.border}`;
    const style: CSSProperties = inline
      ? { display: "flex", padding: 8, borderRadius: 7, border, background: "transparent", flexShrink: 0 }
      : {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 7,
          border,
          background: "transparent",
          color: options.danger ? c.danger : c.textPrimary,
          fontSize: 14,
        };
    return (
      <button
        key={key}
        type="button"
        onClick={onClick}
        disabled={off}
        aria-label={ariaLabel}
        title={label}
        style={{ ...style, opacity: off ? 0.5 : 1, cursor: off ? "default" : "pointer" }}
      >
        {icon}
        {!inline && label}
      </button>
    );
  };

  const iconSize = inline ? 15 : 14;
  const actions = [
    // Lio ilk sırada: tek "okuma" eylemi, geri kalanların hepsi veriyi değiştiriyor.
    // Lio gizliyken çizilmez (bkz. AskLioButton — dinleyen panel mount edilmiyor).
    showLio &&
      lioTasks &&
      actionButton(
        "lio",
        "Lio'ya sor",
        "Seçilenleri Lio'ya sor",
        <LioMascotIcon size={iconSize + 2} />,
        () => askLioAboutMany(lioTasks)
      ),
    onDuplicate &&
      actionButton("dup", "Çoğalt", "Seçilenleri çoğalt", <IconCopy size={iconSize} color={c.textSecondary} />, onDuplicate),
    onMove &&
      actionButton("move", "Taşı", "Seçilenleri taşı", <IconMove size={iconSize} color={c.textSecondary} />, onMove),
    onArchive &&
      actionButton(
        "arch",
        "Arşivle",
        "Seçilenleri arşivle",
        <IconArchive size={iconSize} color={c.textSecondary} />,
        onArchive
      ),
    onDelete &&
      actionButton("del", "Sil", "Seçilenleri sil", <IconTrash size={iconSize} color={c.danger} />, onDelete, {
        danger: true,
      }),
    actionButton("cancel", "Vazgeç", "Seçimi iptal et", <IconX size={iconSize} color={c.textSecondary} />, onCancel, {
      borderless: true,
      alwaysEnabled: true,
    }),
  ].filter(Boolean);

  // Satır içi: araç çubuğunun kendi satırında kal, kutu çizme.
  if (inline) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
        {selectedCount > 0 && (
          <span style={{ fontSize: 14, color: c.textSecondary, whiteSpace: "nowrap" }}>{selectedCount} seçili</span>
        )}
        {actions}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        flexWrap: "wrap",
        marginBottom: 10,
        padding: "10px 14px",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.surface,
      }}
    >
      {/* Hiçbir şey seçili değilken metin yok: "Görev seç" satırı, kullanıcı zaten
          Seç'e bastığı için hiçbir bilgi taşımıyor ve dar ekranda eylemleri bir alt
          satıra itiyordu. Sayaç yalnızca gerçekten bir sayı olduğunda görünür. */}
      {selectedCount > 0 && (
        <span style={{ fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>{selectedCount} görev seçili</span>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>
    </div>
  );
}
