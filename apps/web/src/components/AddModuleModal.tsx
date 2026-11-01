import { useEffect, useState } from "react";
import type { Department, ModuleCatalogEntry, OrganizationModule } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ModuleEmblem from "./ModuleEmblem";
import { useT } from "../lib/i18n";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import { departmanAdi } from "../lib/departmanAdi";
import { departmaninKatalogu } from "../lib/modulYeri";
import ModulHakkiBilgisi, { hakkiAsiyor, useModulHakki } from "./ModulHakkiBilgisi";

interface Props {
  organizationId: string;
  onClose: () => void;
  onAdded: () => void;
  /**
   * Departman sayfasından açıldığında o departman: seçim adımı atlanır,
   * doğrudan o departmanın eklenebilir modülleri listelenir.
   */
  fixedDepartmentId?: string;
}

// Şirket anasayfasındaki birleşik "+" menüsünden ("Modül ekle") açılır. Modül
// kataloğu departmana özgü olduğundan (bkz. DepartmentModulesPanel), burada
// önce hangi departmana ekleneceği seçilir, sonra o departmanın henüz etkin
// olmayan modülleri listelenir — DepartmentModulesPanel.AddModulesForm ile aynı
// ekleme mantığı, tek farkla: departman seçimi burada ek bir adım.
//
// Departmanı açılmamış bir modül için departman kurmak gerekmez: Yönetim'in
// listesinde durur ve orada açılır (bkz. lib/modulYeri.ts). Küçük işletmeler
// kimsesi olmayan departmanlar kurmasın diye — departman sonradan açılınca
// modül oraya geçer. Arada "Yönetici (departmansız)" diye ayrı bir seçenek
// vardı; departmanların yanında kafa karıştırdığı için kaldırıldı.
export default function AddModuleModal({ organizationId, onClose, onAdded, fixedDepartmentId }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [departments, setDepartments] = useState<Department[]>([]);
  // Katalog anahtarı olmayan (özel) departmanların modülü yok, seçicide yoklar.
  const [fullCatalog, setFullCatalog] = useState<ModuleCatalogEntry[]>([]);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [departmentId, setDepartmentId] = useState(fixedDepartmentId ?? "");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hak = useModulHakki(organizationId);
  const asiyor = hakkiAsiyor(hak, selectedKeys);

  useEffect(() => {
    Promise.all([
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
      api.get<OrganizationModule[]>(`/organizations/${organizationId}/modules`).catch(() => []),
      api.get<ModuleCatalogEntry[]>("/module-catalog").catch(() => []),
    ])
      .then(([depts, mods, cat]) => {
        const secilebilir = depts.filter((d) => d.catalogKey);
        setDepartments(secilebilir);
        setFullCatalog(cat);
        // Tek departman varsa (küçük şirkette çoğu zaman yalnızca Yönetim)
        // sorulacak bir şey yok.
        if (!fixedDepartmentId && secilebilir.length === 1) setDepartmentId(secilebilir[0].id);
        setEnabledKeys(new Set(mods.map((m) => m.moduleKey)));
      })
      .finally(() => setLoadingDepts(false));
  }, [organizationId]);

  // Departman sayfasından açıldıysa (fixedDepartmentId) seçicideki liste
  // yüklenene kadar departman bilinmiyor; katalog o zaman süzülür.
  const dept = departments.find((d) => d.id === departmentId);
  const catalog = departmaninKatalogu(fullCatalog, dept?.catalogKey, departments);
  const loadingCatalog = loadingDepts;
  useEffect(() => {
    setSelectedKeys([]);
    setError("");
  }, [departmentId]);

  const availableCatalog = catalog.filter((entry) => !enabledKeys.has(entry.key));

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0) {
      setError(t("En az bir modül seç"));
      return;
    }
    setError("");
    setSaving(true);
    try {
      await api.post(`/organizations/${organizationId}/modules`, { moduleKeys: selectedKeys });
      // Sidebar ağacı departmanın altında modülleri listeliyor.
      notifySidebarChanged();
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Modül eklenemedi"));
      setSaving(false);
    }
  };

  return (
    <Modal title={t("Modül ekle")} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {!fixedDepartmentId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>{t("Departman")}</label>
          {loadingDepts ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : (
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} style={{ width: "100%" }}>
              <option value="">{t("Departman seç…")}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {departmanAdi(d.name, t)}
                </option>
              ))}
            </select>
          )}
        </div>
        )}

        {departmentId &&
          (loadingCatalog ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
          ) : availableCatalog.length === 0 ? (
            <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
              {t("Bu departmanın modüllerinin hepsi zaten etkin.")}
            </p>
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
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      textAlign: "left",
                      padding: "6px 10px 6px 6px",
                      borderRadius: 8,
                      border: `1.5px solid ${active ? c.primary : c.border}`,
                      background: active ? c.background : "transparent",
                      fontSize: 13,
                      color: c.textPrimary,
                    }}
                  >
                    <ModuleEmblem moduleKey={entry.key} size={28} />
                    {entry.name}
                  </button>
                );
              })}
            </div>
          ))}

        <ModulHakkiBilgisi durum={hak} secilen={selectedKeys} />

        {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

        <button
          data-primary
          onClick={handleSave}
          disabled={saving || !departmentId || selectedKeys.length === 0 || asiyor}
          style={{
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 15,
            fontWeight: 500,
            opacity: !departmentId || selectedKeys.length === 0 || asiyor ? 0.6 : 1,
          }}
        >
          {saving ? t("Ekleniyor…") : t("Modülleri ekle")}
        </button>
      </div>
    </Modal>
  );
}
