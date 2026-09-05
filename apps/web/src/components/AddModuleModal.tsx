import { useEffect, useState } from "react";
import type { Department, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { useT } from "../lib/i18n";

interface Props {
  organizationId: string;
  onClose: () => void;
  onAdded: () => void;
}

// Şirket anasayfasındaki birleşik "+" menüsünden ("Modül ekle") açılır. Modül
// kataloğu departmana özgü olduğundan (bkz. DepartmentModulesPanel), burada
// önce hangi departmana ekleneceği seçilir, sonra o departmanın henüz etkin
// olmayan modülleri listelenir — DepartmentModulesPanel.AddModulesForm ile aynı
// ekleme mantığı, tek farkla: departman seçimi burada ek bir adım.
export default function AddModuleModal({ organizationId, onClose, onAdded }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [departmentId, setDepartmentId] = useState("");
  const [catalog, setCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
    ])
      .then(([depts, mods]) => {
        setDepartments(depts.filter((d) => d.catalogKey));
        setEnabledKeys(new Set(mods.map((m) => m.moduleKey)));
      })
      .finally(() => setLoadingDepts(false));
  }, [organizationId]);

  useEffect(() => {
    const dept = departments.find((d) => d.id === departmentId);
    if (!dept?.catalogKey) {
      setCatalog([]);
      return;
    }
    setLoadingCatalog(true);
    setSelectedKeys([]);
    setError("");
    api
      .get<ModuleCatalogEntry[]>(`/module-catalog?departmentKey=${encodeURIComponent(dept.catalogKey)}`)
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setLoadingCatalog(false));
  }, [departmentId, departments]);

  const availableCatalog = catalog.filter((entry) => !enabledKeys.has(entry.key));

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
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Modül eklenemedi");
      setSaving(false);
    }
  };

  return (
    <Modal title={t("Modül ekle")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Departman")}</label>
          {loadingDepts ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : departments.length === 0 ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
              {t("Modül eklemek için önce standart departmanlardan birini eklemelisin.")}
            </p>
          ) : (
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Departman seç…")}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {departmentId &&
          (loadingCatalog ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : availableCatalog.length === 0 ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Bu departmanın modüllerinin hepsi zaten etkin.")}</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
              {availableCatalog.map((entry) => {
                const active = selectedKeys.includes(entry.key);
                return (
                  <button
                    key={entry.key}
                    type="button"
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
          ))}

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        <button
          data-primary
          onClick={handleSave}
          disabled={saving || !departmentId || selectedKeys.length === 0}
          style={{
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 15,
            fontWeight: 500,
            opacity: !departmentId || selectedKeys.length === 0 ? 0.6 : 1,
          }}
        >
          {saving ? "Ekleniyor…" : "Modülleri ekle"}
        </button>
      </div>
    </Modal>
  );
}
