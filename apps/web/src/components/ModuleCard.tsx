import { Link } from "react-router-dom";
import type { ModuleCatalogEntry } from "@projelio/shared";
import { colors } from "../theme/colors";
import { IconSparkle } from "./icons";

interface Props {
  entry: ModuleCatalogEntry;
  // Bulunabilirse (bu modülün departmanı bu organizasyonda gerçekten kurulmuşsa)
  // karta tıklamak o departmanın sayfasına götürür.
  departmentId?: string;
}

// Diğer kartlarla (Departman/Ürün/İş) aynı sabit-boy mantığı ama kapak fotoğrafı
// alanı olmadan — "eklenen modüller ... kapak fotosuz kart görünümde, boyutları
// sabit ve eşit olsun".
const CARD_HEIGHT = 128;

export default function ModuleCard({ entry, departmentId }: Props) {
  const c = colors.light;
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
  } as const;

  if (departmentId) {
    return (
      <Link to={`/departments/${departmentId}`} draggable={false} className="entity-card" style={cardStyle}>
        {content}
      </Link>
    );
  }

  return <div style={cardStyle}>{content}</div>;
}
