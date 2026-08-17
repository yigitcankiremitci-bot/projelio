import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { JobModule, ModuleCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { isOpenableModule } from "../lib/entityModules";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { moduleSurface } from "../lib/moduleSurfaces";
import { useUndo } from "../lib/undo";
import ModuleCard from "./ModuleCard";
import ModuleModal from "./ModuleModal";

interface Props {
  jobId: string;
}

/**
 * Bir işe atanmış modüller.
 *
 * Serbest çalışanda modüller anasayfadan işe atanıyordu ama yalnızca orada
 * görünüyordu: kullanıcı işin sayfasına girdiğinde o işin modüllerine
 * ulaşamıyordu. Modül işin bir parçasıysa işin içinde de durmalı — şirket
 * tarafında departman sayfasının yaptığı işi burada iş sayfası yapıyor.
 *
 * Departman panelindeki ile aynı davranış: kart ızgarası, sayfa yüzeyli modül
 * kendi adresinde, modal yüzeyli olan yerinde açılır.
 */
export default function JobModulesPanel({ jobId }: Props) {
  const c = colors.light;
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [assigned, setAssigned] = useState<JobModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [modalKey, setModalKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { pushUndo } = useUndo();

  const load = () => {
    setLoading(true);
    Promise.all([
      // Serbest çalışana açık modüller: katalogda applies_to_freelancer=true.
      api.get<ModuleCatalogEntry[]>("/module-catalog?freelancer=true").catch(() => []),
      api.get<JobModule[]>(`/jobs/${jobId}/modules`).catch(() => []),
    ])
      .then(([cat, mods]) => {
        setCatalog(cat);
        setAssigned(mods);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [jobId]);

  const isAssigned = (key: string) => assigned.some((m) => m.moduleKey === key);

  const assign = async (moduleKey: string) => {
    setBusyKey(moduleKey);
    try {
      await api.post(`/jobs/${jobId}/modules`, { moduleKey });
      setAdding(false);
      load();
      pushUndo({
        label: "Modül atama",
        run: async () => {
          await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
          load();
        },
        redo: async () => {
          await api.post(`/jobs/${jobId}/modules`, { moduleKey });
          load();
        },
      });
    } finally {
      setBusyKey(null);
    }
  };

  const unassign = async (moduleKey: string) => {
    setBusyKey(moduleKey);
    try {
      if (modalKey === moduleKey) setModalKey(null);
      // Modülü işten kaldırmak kayıtları silmez, yalnızca bağı koparır.
      await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
      load();
      pushUndo({
        label: "Modül kaldırma",
        run: async () => {
          await api.post(`/jobs/${jobId}/modules`, { moduleKey });
          load();
        },
        redo: async () => {
          await api.delete(`/jobs/${jobId}/modules/${moduleKey}`);
          load();
        },
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>;

  const activeEntries = catalog.filter((e) => isAssigned(e.key));
  const availableEntries = catalog.filter((e) => !isAssigned(e.key));
  const modalEntry = modalKey ? catalog.find((e) => e.key === modalKey) ?? null : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Ekleme düğmesi panelin kendi başlığında: alttaki global "+" bu sayfada
          zaten proje/rutin/görev menüsünü yönetiyor (bkz. JobDetail
          useProjectFabAction) ve iki bileşen aynı düğmeye yazamaz. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500, color: c.textPrimary }}>Modüller</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
        >
          {adding ? "Vazgeç" : "+ Modül ekle"}
        </button>
      </div>

      {adding && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 12, padding: 12 }}>
          <span style={{ fontSize: 13, color: c.textSecondary }}>Bu işe eklenebilecek modüller</span>
          {availableEntries.length === 0 ? (
            <span style={{ fontSize: 13, color: c.textSecondary }}>Eklenebilecek başka modül yok.</span>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {availableEntries.map((entry) => (
                <button
                  key={entry.key}
                  onClick={() => assign(entry.key)}
                  disabled={busyKey === entry.key}
                  title={entry.description}
                  style={{
                    fontSize: 13,
                    padding: "5px 10px",
                    borderRadius: 20,
                    border: `1px solid ${c.border}`,
                    background: c.surface,
                    color: c.textPrimary,
                    cursor: "pointer",
                  }}
                >
                  + {entry.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeEntries.length === 0 ? (
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
          Bu işe henüz modül eklenmedi. Yukarıdaki "+ Modül ekle" ile başlayabilirsin.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {activeEntries.map((entry) => {
            const openable = isOpenableModule(entry.key, Boolean(MODULE_RECORD_CONFIGS[entry.key]));
            const opensInModal = moduleSurface(entry.key) === "modal";
            return (
              <ModuleCard
                key={entry.key}
                entry={entry}
                onClick={openable && opensInModal ? () => setModalKey(entry.key) : undefined}
                to={openable && !opensInModal ? `/jobs/${jobId}/modules/${encodeURIComponent(entry.key)}` : undefined}
                onRemove={() => unassign(entry.key)}
                removeDisabled={busyKey === entry.key}
              />
            );
          })}
        </div>
      )}

      {modalEntry && (
        <ModuleModal
          moduleKey={modalEntry.key}
          moduleName={modalEntry.name}
          description={modalEntry.description}
          jobId={jobId}
          onClose={() => setModalKey(null)}
        />
      )}
    </div>
  );
}
