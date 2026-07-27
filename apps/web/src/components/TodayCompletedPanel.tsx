import { useState } from "react";
import type { Task } from "@projelio/shared";
import { colors } from "../theme/colors";
import { IconCheck, IconChevronRight } from "./icons";

interface Props {
  tasks: Task[];
}

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// İşin bugünkü aktivite özeti: tüm ekibin bugün tamamladığı görev/alt görevler,
// hangi projeye ait olduğu, kim tarafından bitirildiği ve saatiyle birlikte listelenir.
// Liste uzayabildiği için başlık her zaman görünür, gövde ise açılır/kapanır.
export default function TodayCompletedPanel({ tasks }: Props) {
  const c = colors.light;
  const [open, setOpen] = useState(false);

  const completedToday = tasks
    .filter((t) => t.status === "completed" && isToday(t.completedAt))
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime());

  return (
    <div
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        marginBottom: 20,
        overflow: "hidden",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
        }}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px", cursor: "pointer" }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: `${c.success}1f`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconCheck size={13} color={c.success} />
        </span>
        <h4 style={{ fontSize: 16, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Bugün yapılanlar</h4>
        {completedToday.length > 0 && (
          <span
            style={{
              fontSize: 13,
              color: c.textSecondary,
              background: c.background,
              border: `1px solid ${c.border}`,
              borderRadius: 20,
              padding: "1px 8px",
            }}
          >
            {completedToday.length}
          </span>
        )}
        <span
          style={{
            display: "inline-flex",
            marginLeft: "auto",
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        >
          <IconChevronRight size={14} color={c.textSecondary} />
        </span>
      </div>

      <div style={{ maxHeight: open ? 2000 : 0, overflow: "hidden", transition: "max-height 0.25s ease" }}>
        <div style={{ padding: "0 16px 14px" }}>
          {completedToday.length === 0 ? (
            <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>Bugün henüz tamamlanan görev yok.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {completedToday.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: c.background,
                  }}
                >
                  <IconCheck size={12} color={c.success} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15,
                        color: c.textPrimary,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.parentTaskId ? "↳ " : ""}
                      {t.title}
                    </div>
                    {t.projectTitle && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 12,
                          color: c.textSecondary,
                          background: c.surface,
                          border: `1px solid ${c.border}`,
                          borderRadius: 20,
                          padding: "1px 8px",
                          marginTop: 3,
                        }}
                      >
                        {t.projectTitle}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 13, color: c.accentDark, fontWeight: 500, flexShrink: 0, whiteSpace: "nowrap" }}>
                    {t.completedByName ?? "Bilinmeyen"}
                  </span>
                  <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                    {new Date(t.completedAt!).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
