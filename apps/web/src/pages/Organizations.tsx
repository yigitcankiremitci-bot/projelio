import { useEffect, useRef, useState } from "react";
import type { Organization } from "@projelio/shared";
import { api } from "../api/client";
import OrganizationCard from "../components/OrganizationCard";
import { useThemeColors } from "../theme/useThemeColors";
import { useSortableList } from "../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo, useWithoutPendingDeletes } from "../lib/undo";
import { useT } from "../lib/i18n";

export default function Organizations() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const c = useThemeColors();
  const t = useT();
  const gridRef = useRef<HTMLDivElement>(null);
  const registerReorderUndo = useReorderUndo();
  const organizationsRef = useLatestRef(organizations);
  // Silinmeyi bekleyen kayıtlar (geri alma penceresi) sunucudan hâlâ geliyor; elenir.
  const visibleOrganizations = useWithoutPendingDeletes(organizations);

  const reload = () => {
    api.get<Organization[]>("/organizations").then(setOrganizations).catch(() => setOrganizations([]));
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
        const previousIds = organizationsRef.current.map((o) => o.id);
        setOrganizations((prev) => {
          const byId = new Map(prev.map((o) => [o.id, o]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch("/organizations/reorder", { ids }).catch(() => reload());
        registerReorderUndo("/organizations/reorder", previousIds, ids, reload);
      },
    },
    [visibleOrganizations.length === 0]
  );

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: 28 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Organizasyonlar")}</h1>
      </div>

      {visibleOrganizations.length === 0 ? (
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
          {t("Henüz organizasyon yok. Alttaki \"+\" butonuyla, projelerini bir şirket/marka altında toplamak için bir tane oluşturabilirsin — bu tamamen opsiyonel, freelance projelerin etkilenmez.")}
        </div>
      ) : (
        <div ref={gridRef} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {visibleOrganizations.map((o) => (
            <div key={o.id} data-id={o.id}>
              <OrganizationCard organization={o} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
