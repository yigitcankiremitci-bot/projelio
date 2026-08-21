import { useEffect, useMemo, useRef, useState } from "react";
import type { PersonalBoardItem, SchedulableTask } from "@projelio/shared";
import { useThemeColors } from "../../theme/useThemeColors";
import { planning } from "../../api/planning";
import { DRAG_ITEM, shortDayLabel, type DraggedItem } from "../../lib/planGrid";

interface Props {
  /** Kişisel pano: kullanıcının kendi görevleri + kendisine atananlar. */
  unscheduled: PersonalBoardItem[];
}

type Tab = "mine" | "projects";

/**
 * Takvime sürüklenecek işlerin seçildiği yan panel.
 *
 * İki sekme var ve ayrımları kapsam farkı:
 *   İşlerim        kişisel görevler + kullanıcıya atananlar (kendi tabağı)
 *   Proje görevleri erişilen tüm proje/program görevleri (kimseye atanmamış olsa da)
 *
 * İkinci sekme bir gereklilikten doğdu: serbest çalışan kendi projesindeki bir
 * işe, onu kimseye atamadan zaman ayırmak ister — "Pist Prodüksiyon" işindeki
 * "samar-unfazed" projesinin görevi gibi. Böyle bir görev kişisel panoda hiç
 * görünmez, çünkü pano yalnızca atanmış işleri taşır.
 *
 * Atanmış görevlerin iki sekmede birden görünmesi beklenen bir durum: biri
 * "bugün ne yapmam gerekiyor", diğeri "neye zaman ayırabilirim" sorusunu
 * cevaplıyor.
 */
export default function SchedulePickerPanel({ unscheduled }: Props) {
  const c = useThemeColors();
  const [tab, setTab] = useState<Tab>("mine");
  const [query, setQuery] = useState("");
  const [tasks, setTasks] = useState<SchedulableTask[] | null>(null);
  const [loading, setLoading] = useState(false);

  // Proje görevleri sekmesi AÇILDIĞINDA çekilir; takvim ilk yüklemede bu
  // sorguyu ödemek zorunda kalmasın.
  useEffect(() => {
    if (tab !== "projects") return;
    let cancelled = false;
    setLoading(true);
    // Yazarken her tuşta istek atmamak için kısa bir gecikme.
    const timer = setTimeout(() => {
      planning
        .listSchedulableTasks(query.trim() || undefined)
        .then((data) => {
          if (!cancelled) setTasks(data ?? []);
        })
        .catch(() => {
          if (!cancelled) setTasks([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, query ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tab, query]);

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")} label="İşlerim" count={unscheduled.length} />
        <TabButton active={tab === "projects"} onClick={() => setTab("projects")} label="Proje görevleri" />
      </div>

      <p style={{ margin: "0 0 10px", fontSize: 12, color: c.textSecondary }}>
        Takvime sürükleyerek zaman ayır.
      </p>

      {tab === "mine" ? (
        <MineList items={unscheduled} />
      ) : (
        <ProjectTaskList
          tasks={tasks}
          loading={loading}
          query={query}
          onQueryChange={setQuery}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  const c = useThemeColors();
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: "6px 8px",
        fontSize: 13,
        borderRadius: 8,
        border: `1px solid ${active ? c.primary : c.border}`,
        background: active ? c.primary : c.surface,
        color: active ? "#fff" : c.textPrimary,
        cursor: "pointer",
      }}
    >
      {label}
      {count != null && count > 0 ? ` (${count})` : ""}
    </button>
  );
}

function MineList({ items }: { items: PersonalBoardItem[] }) {
  const c = useThemeColors();

  if (items.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>
        Açık işlerinin hepsine zaman ayırmışsın.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 420, overflowY: "auto" }}>
      {items.map((item) => (
        <DraggableCard
          key={item.itemId}
          payload={{
            itemId: item.itemId,
            // Pano kartının kaynağı "assigned" ise arkasında bir tasks satırı
            // var; blok ona bağlanır.
            kind: item.source === "personal" ? "personal" : "task",
            title: item.title,
          }}
          title={item.title}
          meta={[
            item.source === "personal"
              ? "Kişisel"
              : (item.projectTitle ?? item.operationTitle ?? item.departmentName ?? "Atanan"),
            item.effectiveDueDate ? shortDayLabel(item.effectiveDueDate.slice(0, 10)) : undefined,
          ]}
        />
      ))}
    </div>
  );
}

function ProjectTaskList({
  tasks,
  loading,
  query,
  onQueryChange,
}: {
  tasks: SchedulableTask[] | null;
  loading: boolean;
  query: string;
  onQueryChange: (v: string) => void;
}) {
  const c = useThemeColors();
  const inputRef = useRef<HTMLInputElement>(null);

  // Görevler işe göre gruplanıyor: "Pist Prodüksiyon" altında hangi projelerin
  // hangi görevleri olduğunu görmek, düz bir listede aramaktan hızlı.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: SchedulableTask[] }>();
    for (const t of tasks ?? []) {
      const key = t.jobId ?? "_";
      let group = map.get(key);
      if (!group) {
        group = { label: t.jobTitle ?? "Diğer", items: [] };
        map.set(key, group);
      }
      group.items.push(t);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "tr"));
  }, [tasks]);

  return (
    <>
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Görev ara…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "7px 9px",
          fontSize: 13,
          borderRadius: 7,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: c.textPrimary,
          marginBottom: 10,
        }}
      />

      {loading && tasks === null && (
        <p style={{ margin: 0, fontSize: 13, color: c.textSecondary }}>Görevler yükleniyor…</p>
      )}

      {tasks !== null && tasks.length === 0 && (
        <p style={{ margin: 0, fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          {query ? `"${query}" ile eşleşen açık görev yok.` : "Erişebildiğin projelerde açık görev yok."}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: 420, overflowY: "auto" }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: c.textSecondary,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 5,
              }}
            >
              {group.label}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {group.items.map((task) => (
                <DraggableCard
                  key={task.id}
                  payload={{
                    itemId: task.id,
                    kind: "task",
                    title: task.title,
                    minutes: task.estimatedMinutes,
                  }}
                  title={task.title}
                  meta={[
                    task.projectTitle ?? task.operationTitle,
                    task.deadline ? shortDayLabel(task.deadline.slice(0, 10)) : undefined,
                    // Başkasına atanmış bir göreve de zaman ayrılabilir
                    // (ör. gözden geçirme); kime ait olduğu görünsün.
                    task.assignedToName,
                  ]}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DraggableCard({
  payload,
  title,
  meta,
}: {
  payload: DraggedItem;
  title: string;
  meta: (string | undefined)[];
}) {
  const c = useThemeColors();
  const line = meta.filter(Boolean).join(" · ");

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_ITEM, JSON.stringify(payload));
        e.dataTransfer.effectAllowed = "move";
      }}
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        background: c.background,
        cursor: "grab",
      }}
    >
      <div style={{ fontSize: 13, color: c.textPrimary, lineHeight: "17px" }}>{title}</div>
      {line && <div style={{ fontSize: 11, color: c.textSecondary, marginTop: 2 }}>{line}</div>}
    </div>
  );
}
