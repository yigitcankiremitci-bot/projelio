import type { ProjectStatus } from "@projelio/shared";

const statusStyle: Record<ProjectStatus, { label: string; bg: string; text: string }> = {
  active: { label: "Aktif", bg: "#E1F3E8", text: "#1B6B3C" },
  completed: { label: "Tamamlandı", bg: "#E7EDF9", text: "#26437E" },
  archived: { label: "Arşivlendi", bg: "#F6E8D6", text: "#8C5A28" },
};

export default function StatusBadge({ status }: { status: ProjectStatus }) {
  const s = statusStyle[status];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        padding: "3px 9px",
        borderRadius: 20,
        background: s.bg,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}
