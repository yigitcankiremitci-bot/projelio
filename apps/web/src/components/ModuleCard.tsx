import { Link } from "react-router-dom";
import type { ModuleCatalogEntry } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { IconSparkle, IconX } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  entry: ModuleCatalogEntry;
  // Bulunabilirse (bu modülün departmanı bu organizasyonda gerçekten kurulmuşsa)
  // karta tıklamak doğrudan o modülün çalışma alanını açar.
  departmentId?: string;
  /** departmentId yerine doğrudan bir hedef adres (modülün kendi sayfası). */
  to?: string;
  /** Adres yerine yerinde bir eylem — modal yüzeyli modüller için. */
  onClick?: () => void;
  /** Sağ üstteki kaldırma düğmesi. Verilmezse gösterilmez. */
  onRemove?: () => void;
  removeDisabled?: boolean;
}

// Diğer kartlarla (Departman/Ürün/İş) aynı sabit-boy mantığı ama kapak fotoğrafı
// alanı olmadan — "eklenen modüller ... kapak fotosuz kart görünümde, boyutları
// sabit ve eşit olsun".
const CARD_HEIGHT = 128;

export default function ModuleCard({ entry, departmentId, to, onClick, onRemove, removeDisabled }: Props) {
  const c = useThemeColors();
  const t = useT();
  const content = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 8,
            background: c.background,
            flexShrink: 0,
          }}
        >
          <IconSparkle size={13} color={c.textSecondary} />
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 500,
            color: c.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {entry.name}
        </h3>
      </div>
      {entry.description && (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: c.textSecondary,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }}
        >
          {entry.description}
        </p>
      )}
    </div>
  );

  const cardStyle = {
    display: "block",
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    background: c.surface,
    height: CARD_HEIGHT,
    overflow: "hidden",
    position: "relative",
  } as const;

  // Kaldırma düğmesi kartın kendi tıklama alanının DIŞINDA durmalı: aksi halde
  // modülü açmak isteyen kullanıcı kazara kapatabilir.
  const removeButton = onRemove && (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
      disabled={removeDisabled}
      aria-label={t("Modülü kapat")}
      title={t("Modülü devre dışı bırak")}
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        zIndex: 1,
        background: "transparent",
        border: "none",
        padding: 4,
        display: "flex",
        cursor: "pointer",
      }}
    >
      <IconX size={13} color={c.textSecondary} />
    </button>
  );

  // Modal yüzeyli modüller adrese gitmez, yerinde açılır.
  if (onClick) {
    return (
      <div style={cardStyle}>
        {removeButton}
        <button
          type="button"
          onClick={onClick}
          className="entity-card"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            textAlign: "left",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          {content}
        </button>
      </div>
    );
  }

  if (to) {
    return (
      <div style={cardStyle}>
        {removeButton}
        <Link to={to} draggable={false} className="entity-card" style={{ display: "block", height: "100%" }}>
          {content}
        </Link>
      </div>
    );
  }

  if (departmentId) {
    // tab=modules olmadan departmanın varsayılan sekmesine (genelde Görevler)
    // düşüyorduk ve kullanıcı tıkladığı modülü hiç göremiyordu.
    // module=<key> ise DepartmentModulesPanel'e hangi modülün açılacağını söyler.
    return (
      <Link
        to={`/departments/${departmentId}?tab=modules&module=${encodeURIComponent(entry.key)}`}
        draggable={false}
        className="entity-card"
        style={cardStyle}
      >
        {content}
      </Link>
    );
  }

  return <div style={cardStyle}>{content}</div>;
}
