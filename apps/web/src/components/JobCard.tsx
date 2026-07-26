import { Link } from "react-router-dom";
import type { Job } from "@projelio/shared";
import { colors } from "../theme/colors";
import { IconFolder, IconUser, IconCalendar } from "./icons";

interface Props {
  job: Job;
  projectCount: number;
}

export default function JobCard({ job, projectCount }: Props) {
  const c = colors.light;
  return (
    <Link
      to={`/jobs/${job.id}`}
      style={{
        display: "block",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
      }}
    >
      <div
        style={{
          aspectRatio: "3 / 1",
          background: job.coverImageUrl
            ? `center/cover url(${job.coverImageUrl})`
            : `linear-gradient(135deg, ${c.primary}, ${c.primaryDark})`,
        }}
      />
      <div style={{ padding: 16 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 500, color: c.textPrimary }}>{job.title}</h3>
        {job.description && (
          <p style={{ color: c.textSecondary, fontSize: 12, margin: "0 0 10px", lineHeight: 1.5 }}>{job.description}</p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: c.textSecondary, marginBottom: 10 }}>
          {job.ownerName && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconUser size={12} color={c.textSecondary} />
              <span>{job.ownerName}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconCalendar size={12} color={c.textSecondary} />
            <span>{new Date(job.createdAt).toLocaleDateString("tr-TR")} kuruldu</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
            color: c.textSecondary,
          }}
        >
          <IconFolder size={13} color={c.textSecondary} />
          <span>{projectCount} proje</span>
        </div>
      </div>
    </Link>
  );
}
