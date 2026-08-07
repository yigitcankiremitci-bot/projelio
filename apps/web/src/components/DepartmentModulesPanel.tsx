import { useEffect, useState } from "react";
import type { ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { useProjectFabAction } from "../lib/projectFab";
import { MODULE_RECORD_CONFIGS } from "../lib/moduleRecordConfigs";
import { useUndo } from "../lib/undo";
import ModuleRecordsPanel from "./ModuleRecordsPanel";
import { IconCheck, IconX } from "./icons";

interface Props {
  organizationId: string;
  departmentId: string;
  // Standart departman kataloğundaki anahtar (bkz. Department.catalogKey). Özel
  // (custom) departmanların önceden tanımlı bir modül listesi yoktur.
  departmentKey?: string;
}

// Bir departmanın kullanabileceği araç/modül listesi. Etkinleştirilenler
// ("Etkin Modüller") burada gösterilir; içlerinden bazıları (moduleRecordConfigs.ts'te
// tanımlı olanlar — Gelir-Gider, Fatura, Müşteri, İşe Alım) tıklanınca açılıp
// gerçek veri girişi yapılabilen bir çalışma alanına dönüşür. Yeni modül ekleme,
// departmanlar/ürünlerle aynı desende global "+" düğmesiyle yapılır (bkz.
// BottomNav.tsx) — bu yüzden bu panel departman sayfasındayken FAB'ı yönetir.
// Etkinleştirme durumu organizasyon genelinde tutulur (organization_modules) —
// burada yalnızca bu departmana ait olanlar gösterilir.
export default function DepartmentModulesPanel({ organizationId, departmentId, departmentKey }: Props) {
  const c = colors.light;
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [enabled, setEnabled] = useState<OrganizationModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { pushUndo } = useUndo();

  const load = () => {
    if (!departmentKey) {
      setCatalog([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get<ModuleCatalogEntry[]>(`/module-catalog?departmentKey=${encodeURIComponent(departmentKey)}`).catch(() => []),
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
    ])
      .then(([cat, org]) => {
        setCatalog(cat);
        setEnabled(org);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId, departmentKey]);

  // Özel (kataloğa dayanmayan) departmanların önceden tanımlı modülü yok, o
  // yüzden bu sayfalarda "+" düğmesi devreye girmez.
  useProjectFabAction(
    departmentKey ? { label: "Modül ekle", onClick: () => setAdding((v) => !v) } : null,
    [organizationId, departmentKey]
  );

  const isEnabled = (moduleKey: string) => enabled.some((m) => m.moduleKey === moduleKey);

  const toggleOff = async (moduleKey: string) => {
    setBusyKey(moduleKey);
    try {
      if (expandedKey === moduleKey) setExpandedKey(null);
      await api.delete(`/organizations/${organizationId}/modules/${moduleKey}`);
      load();
      // Modülü kapatmak kayıtları silmez, sadece etkinliği kaldırır — geri alma
      // basitçe aynı modülü yeniden etkinleştirir.
      pushUndo({
        label: "Modül kaldırma",
        run: async () => {
          await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: [moduleKey] });
          load();
        },
        redo: async () => {
          await api.delete(`/organizations/${organizationId}/modules/${moduleKey}`);
          load();
        },
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>;

  if (!departmentKey) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Modüller</h4>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          Bu özel departman için önceden tanımlı bir modül listesi yok.
        </p>
      </div>
    );
  }

  const activeCatalog = catalog.filter((e) => isEnabled(e.key));
  const availableCatalog = catalog.filter((e) => !isEnabled(e.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h4 style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Modüller</h4>

      {adding && (
        <AddModulesForm
          organizationId={organizationId}
          availableCatalog={availableCatalog}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {catalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Bu departman için henüz modül tanımlı değil.</p>
      ) : activeCatalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          Henüz etkinleştirilmiş modül yok. Sağ alttaki "+" ile ekleyebilirsin.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeCatalog.map((entry) => {
            const config = MODULE_RECORD_CONFIGS[entry.key];
            const isExpanded = expandedKey === entry.key;
            return (
              <div
                key={entry.key}
                style={{ border: `1px solid ${c.primary}`, borderRadius: 10, background: `${c.primary}0d`, overflow: "hidden" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 12px" }}>
                  <button
                    type="button"
                    onClick={() => config && setExpandedKey(isExpanded ? null : entry.key)}
                    disabled={!config}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "4px 0",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      cursor: config ? "pointer" : "default",
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 26,
                        height: 26,
                        borderRadius: 8,
                        background: c.primary,
                        flexShrink: 0,
                      }}
                    >
                      <IconCheck size={13} color="#fff" />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: c.textPrimary }}>{entry.name}</div>
                      {entry.description && (
                        <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>{entry.description}</div>
                      )}
                    </div>
                    {config && (
                      <span style={{ fontSize: 12, color: c.primary, fontWeight: 500, flexShrink: 0 }}>
                        {isExpanded ? "Kapat" : "Aç"}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => toggleOff(entry.key)}
                    disabled={busyKey === entry.key}
                    aria-label="Modülü kapat"
                    title="Modülü devre dışı bırak"
                    style={{ background: "transparent", border: "none", flexShrink: 0, padding: 6 }}
                  >
                    <IconX size={14} color={c.textSecondary} />
                  </button>
                </div>

                {isExpanded && config && (
                  <div style={{ borderTop: `1px solid ${c.border}`, padding: "12px 14px", background: c.surface }}>
                    <ModuleRecordsPanel organizationId={organizationId} departmentId={departmentId} moduleKey={entry.key} config={config} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddModulesForm({
  organizationId,
  availableCatalog,
  onClose,
  onAdded,
}: {
  organizationId: string;
  availableCatalog: ModuleCatalogEntry[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const c = colors.light;
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0) {
      setError("En az bir modül seç");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: selectedKeys });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modül eklenemedi");
      setSaving(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Bu departmana modül ekle</span>
        <button onClick={onClose} aria-label="Kapat" style={{ background: "transparent", border: "none" }}>
          <IconX size={16} color={c.textSecondary} />
        </button>
      </div>

      {availableCatalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Bu departmanın modüllerinin hepsi zaten etkin.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 6 }}>
          {availableCatalog.map((entry) => {
            const active = selectedKeys.includes(entry.key);
            return (
              <button
                key={entry.key}
                onClick={() => toggleKey(entry.key)}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: `1.5px solid ${active ? c.primary : c.border}`,
                  background: active ? c.background : "transparent",
                  fontSize: 13,
                  color: c.textPrimary,
                }}
              >
                {entry.name}
              </button>
            );
          })}
        </div>
      )}

      {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

      {availableCatalog.length > 0 && (
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: "9px 0", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 14, fontWeight: 500 }}
        >
          {saving ? "Ekleniyor…" : "Modülleri ekle"}
        </button>
      )}
    </div>
  );
}
