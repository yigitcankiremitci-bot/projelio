import { Link } from "react-router-dom";
import type { Group } from "@projelio/shared";
import { colors } from "../theme/colors";
import { IconFolder, IconLayers, IconBuilding } from "./icons";

interface Props {
  group: Group;
}

export default function GroupCard({ group }: Props) {
  const c = colors.light;
  return (
    <Link
      to={`/groups/${group.id}`}
      draggable={false}
      style={{
        display: "block",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
      }}
    >
      {group.coverImageUrl ? (
        <div style={{ aspectRatio: "3 / 1", background: `center/cover url(${group.coverImageUrl})` }} />
      ) : (
        <div style={{ aspectRatio: "3 / 1", background: c.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconLayers size={22} color={c.textSecondary} />
        </div>
      )}
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{group.name}</h3>
        {group.description && (
          <p style={{ color: c.textSecondary, fontSize: 15, margin: "0 0 10px", lineHeight: 1.5 }}>{group.description}</p>
        )}

        <div style={{ display: "flex", gap: 14, fontSize: 15, paddingTop: 10, borderTop: `1px solid ${c.border}`, color: c.textSecondary }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconBuilding size={13} color={c.textSecondary} />
            <span>{group.organizationCount ?? 0} organizasyon</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconFolder size={13} color={c.textSecondary} />
            <span>{group.jobCount ?? 0} iş</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
