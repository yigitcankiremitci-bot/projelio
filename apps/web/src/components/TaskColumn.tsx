import type { Task, TaskStatus } from "@projelio/shared";
import { colors } from "../theme/colors";

interface Props {
  status: TaskStatus;
  tasks: Task[];
}

const columnLabel: Record<TaskStatus, string> = {
  todo: "Yapılacak",
  in_progress: "Devam Eden",
  completed: "Tamamlandı",
};

export default function TaskColumn({ status, tasks }: Props) {
  const c = colors.light;
  return (
    <div style={{ flex: 1, background: c.background, borderRadius: 8, padding: 12 }}>
      <h4 style={{ color: c.textPrimary }}>{columnLabel[status]}</h4>
      {tasks.map((t) => (
        <div
          key={t.id}
          style={{
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 8,
            padding: 8,
            marginBottom: 8,
          }}
        >
          {t.title}
        </div>
      ))}
    </div>
  );
}
