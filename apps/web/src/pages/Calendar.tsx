import { useState } from "react";
import { colors } from "../theme/colors";

type ViewMode = "day" | "week" | "month";
type Filter = "mine" | "team";

export default function CalendarView() {
  const [view, setView] = useState<ViewMode>("month");
  const [filter, setFilter] = useState<Filter>("mine");
  const c = colors.light;

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <h1 style={{ color: c.textPrimary, fontSize: 18, fontWeight: 500, margin: "0 0 20px" }}>Takvim</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        {(["day", "week", "month"] as ViewMode[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "7px 14px",
              borderRadius: 8,
              border: `1px solid ${view === v ? c.primary : c.border}`,
              background: view === v ? c.primary : c.surface,
              color: view === v ? "#fff" : c.textPrimary,
              fontSize: 13,
            }}
          >
            {v === "day" ? "Günlük" : v === "week" ? "Haftalık" : "Aylık"}
          </button>
        ))}
        <div style={{ marginLeft: "auto" }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="mine">Sadece benim görevlerim</option>
            <option value="team">Tüm ekip takvimi</option>
          </select>
        </div>
      </div>
      {/* TODO: sürükle-bırak destekli takvim gridi (ör. react-big-calendar / dnd-kit) */}
      <div
        style={{
          border: `1px dashed ${c.border}`,
          borderRadius: 12,
          padding: 48,
          textAlign: "center",
          color: c.textSecondary,
          fontSize: 13,
          background: c.surface,
        }}
      >
        {view} görünümü — {filter === "mine" ? "kişisel" : "ekip"} takvim burada render edilecek
      </div>
    </div>
  );
}
