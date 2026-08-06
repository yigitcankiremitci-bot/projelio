import { useEffect, useState } from "react";
import type { Department, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import ModuleCard from "./ModuleCard";

interface Props {
  organizationId: string;
}

// Şirket anasayfasındaki "Modüller" sekmesi: organizasyonda (hangi departmandan
// etkinleştirilmiş olursa olsun) etkin olan TÜM modülleri kart görünümünde
// gösterir — böylece yöneticiler her departmana ayrı ayrı girmeden ekli tüm
// modülleri tek yerde görebilir. Ekleme/kaldırma ilgili departmanın kendi
// sayfasından ("+" düğmesi) yapılır; bu sekme salt görünürlük içindir.
export default function ModulesPanel({ organizationId }: Props) {
  const c = colors.light;
  const [enabled, setEnabled] = useState<OrganizationModule[]>([]);
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
      api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []),
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
    ])
      .then(([e, cat, d]) => {
        setEnabled(e);
        setCatalog(cat);
        setDepartments(d);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId]);

  const deptIdByCatalogKey = new Map(departments.filter((d) => d.catalogKey).map((d) => [d.catalogKey as string, d.id]));
  const enabledKeys = new Set(enabled.map((m) => m.moduleKey));
  const activeEntries = catalog.filter((e) => enabledKeys.has(e.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Modüller</h2>

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : activeEntries.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${c.border}`,
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 15,
          }}
        >
          Henüz etkinleştirilmiş modül yok. Bir departmanın sayfasından "+" ile modül ekleyebilirsin.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
          {activeEntries.map((entry) => (
            <ModuleCard key={entry.key} entry={entry} departmentId={entry.departmentKey ? deptIdByCatalogKey.get(entry.departmentKey) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
