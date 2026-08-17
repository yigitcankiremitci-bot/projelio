import { Link } from "react-router-dom";
import { coverBackground } from "../lib/covers";
import type { Organization } from "@projelio/shared";
import { colors } from "../theme/colors";
import { IconFolder, IconLayers, IconBuilding } from "./icons";

interface Props {
  organization: Organization;
}

export default function OrganizationCard({ organization }: Props) {
  const c = colors.light;
  return (
    <Link
      to={`/organizations/${organization.id}`}
      draggable={false}
      style={{
        display: "block",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
      }}
    >
      {organization.coverImageUrl ? (
        <div style={{ aspectRatio: "3 / 1", background: coverBackground(organization.coverImageUrl) }} />
      ) : (
        <div style={{ aspectRatio: "3 / 1", background: c.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IconBuilding size={22} color={c.textSecondary} />
        </div>
      )}
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{organization.name}</h3>
        {organization.description && (
          <p style={{ color: c.textSecondary, fontSize: 15, margin: "0 0 10px", lineHeight: 1.5 }}>{organization.description}</p>
        )}

        {organization.groupName && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 15, color: c.textSecondary, marginBottom: 10 }}>
            <IconLayers size={12} color={c.textSecondary} />
            <span>{organization.groupName}</span>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
            color: c.textSecondary,
          }}
        >
          <IconFolder size={13} color={c.textSecondary} />
          <span>{organization.jobCount ?? 0} iş</span>
        </div>
      </div>
    </Link>
  );
}
