import { useState } from "react";
import { colors } from "../theme/colors";

type ViewMode = "day" | "week" | "month";
type Filter = "mine" | "team";

export default function CalendarView() {
  const [view, setView] = useState<ViewMode>("month");
  const [filter, setFilter] = useState<Filter>("mine");
  const c = colors.light;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: c.textPrimary }}>Takvim</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["day", "week", "month"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: view === v ? c.primary : c.surface,
              color: view === v ? "#fff" : c.textPrimary,
            }}
          >
            {v === "day" ? "Günlük" : v === "week" ? "Haftalık" : "Aylık"}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="mine">Sadece Benim Görevlerim</option>
            <option value="team">Tüm Ekip Takvimi</option>
          </select>
        </div>
      </div>
      {/* TODO: sürükle-bırak destekli takvim gridi (ör. react-big-calendar / dnd-kit) */}
      <div style={{ border: `1px dashed ${c.border}`, borderRadius: 12, padding: 40, textAlign: "center", color: c.textSecondary }}>
        {view} görünümü — {filter === "mine" ? "kişisel" : "ekip"} takvim burada render edilecek
      </div>
    </div>
  );
}
