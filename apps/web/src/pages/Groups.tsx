import { useEffect, useRef, useState } from "react";
import type { Group } from "@projelio/shared";
import { api } from "../api/client";
import GroupCard from "../components/GroupCard";
import { colors } from "../theme/colors";
import { useSortableList } from "../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useWithoutPendingDeletes } from "../lib/undo";

export default function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const c = colors.light;
  const gridRef = useRef<HTMLDivElement>(null);
  const registerReorderUndo = useReorderUndo();
  const groupsRef = useLatestRef(groups);
  // Silinmeyi bekleyen gruplar (geri alma penceresi) sunucudan hâlâ geliyor; elenir.
  const visibleGroups = useWithoutPendingDeletes(groups);

  const reload = () => {
    api.get<Group[]>("/groups").then(setGroups).catch(() => setGroups([]));
  };

  useEffect(reload, []);
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(reload);

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        const previousIds = groupsRef.current.map((g) => g.id);
        setGroups((prev) => {
          const byId = new Map(prev.map((g) => [g.id, g]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch("/groups/reorder", { ids }).catch(() => reload());
        registerReorderUndo("/groups/reorder", previousIds, ids, reload);
      },
    },
    [visibleGroups.length === 0]
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Gruplar (Holding)</h1>
      </div>

      {visibleGroups.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 40,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 16,
          }}
        >
          Henüz grup yok. Alttaki "+" butonuyla, birden çok organizasyonu tek bir holding altında toplamak istersen bir tane oluşturabilirsin — bu tamamen opsiyonel.
        </div>
      ) : (
        <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {visibleGroups.map((g) => (
            <div key={g.id} data-id={g.id}>
              <GroupCard group={g} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
