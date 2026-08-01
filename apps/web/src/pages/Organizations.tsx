import { useEffect, useRef, useState } from "react";
import type { Organization } from "@projelio/shared";
import { api } from "../api/client";
import OrganizationCard from "../components/OrganizationCard";
import { colors } from "../theme/colors";
import { useSortableList } from "../lib/useSortableList";

export default function Organizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const c = colors.light;
  const gridRef = useRef<HTMLDivElement>(null);

  const reload = () => {
    api.get<Organization[]>("/organizations").then(setOrganizations).catch(() => setOrganizations([]));
  };

  useEffect(reload, []);

  useSortableList(
    gridRef,
    {
      onEnd: () => {
        const el = gridRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        setOrganizations((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch("/organizations/reorder", { ids }).catch(() => reload());
      },
    },
    [organizations.length === 0]
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Organizasyonlar</h1>
      </div>

      {organizations.length === 0 ? (
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
          Henüz organizasyon yok. Alttaki "+" butonuyla, projelerini bir şirket/marka altında toplamak için bir tane oluşturabilirsin — bu tamamen opsiyonel, freelance projelerin etkilenmez.
        </div>
      ) : (
        <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {organizations.map((o) => (
            <div key={o.id} data-id={o.id}>
              <OrganizationCard organization={o} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
