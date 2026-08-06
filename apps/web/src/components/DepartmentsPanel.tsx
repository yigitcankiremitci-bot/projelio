import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Department, DepartmentCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import { useProjectFabAction } from "../lib/projectFab";
import DepartmentCard from "./DepartmentCard";
import { IconX } from "./icons";

export interface DepartmentsPanelHandle {
  openAdd: () => void;
}

interface Props {
  organizationId: string;
  // Şirket anasayfasında Ürün/Hizmet ile birlikte gösterildiğinde global "+"
  // düğmesi tek bir birleşik seçim menüsüne (bkz. OrganizationDetail) bağlanır;
  // bu durumda useFab=false verilip ekleme DepartmentsPanelHandle.openAdd ile
  // dışarıdan tetiklenir (ProductsPanel'deki useFab deseninin aynısı).
  useFab?: boolean;
}

// Departmanlar tek satırda, sabit genişlikli kartlarla listelenir; sığmadığında
// yana kaydırarak seçilebilir. Her karta tıklamak departmanın kendi sayfasına
// (kadro yönetimi, varsa ürünler) götürür.
const DepartmentsPanel = forwardRef<DepartmentsPanelHandle, Props>(function DepartmentsPanel(
  { organizationId, useFab = true },
  ref
) {
  const c = colors.light;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catalog, setCatalog] = useState<DepartmentCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get<Department[]>(`/organizations/${organizationId}/departments`).catch(() => []),
      api.get<DepartmentCatalogEntry[]>("/department-catalog").catch(() => []),
    ])
      .then(([depts, cat]) => {
        setDepartments(depts);
        setCatalog(cat);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId]);

  useImperativeHandle(ref, () => ({ openAdd: () => setAdding(true) }));

  // Departman ekleme, sayfaya özgü ayrı bir buton yerine uygulamanın her yerinde
  // kullanılan alt navigasyondaki "+" düğmesiyle tetiklenir (bkz. BottomNav.tsx).
  // useFab=false ise (bkz. OrganizationDetail) bu panel FAB'ı kendi kaydetmez.
  useProjectFabAction(useFab ? { label: "Departman ekle", onClick: () => setAdding((v) => !v) } : null, [
    organizationId,
    useFab,
  ]);

  const existingKeys = new Set(departments.map((d) => d.catalogKey).filter(Boolean));
  const availableCatalog = catalog.filter((entry) => !existingKeys.has(entry.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Departmanlar</h2>

      {adding && (
        <AddDepartmentForm
          organizationId={organizationId}
          availableCatalog={availableCatalog}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : departments.length === 0 ? (
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
          Henüz departman yok. ISO 9001 uyumlu standart departman listesinden seçebilir ya da özel bir departman
          açabilirsin.
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 14,
            overflowX: "auto",
            paddingBottom: 6,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {departments.map((dept) => (
            <div key={dept.id} style={{ flex: "0 0 260px", width: 260 }}>
              <DepartmentCard
                department={dept}
                onCoverUpdated={(coverImageUrl) =>
                  setDepartments((prev) => prev.map((d) => (d.id === dept.id ? { ...d, coverImageUrl } : d)))
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default DepartmentsPanel;

function AddDepartmentForm({
  organizationId,
  availableCatalog,
  onClose,
  onAdded,
}: {
  organizationId: string;
  availableCatalog: DepartmentCatalogEntry[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const c = colors.light;
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0 && !customName.trim()) {
      setError("En az bir departman seç ya da özel bir isim gir");
      return;
    }
    setError("");
    setSaving(true);
    try {
      for (const key of selectedKeys) {
        await api.post(`/organizations/${organizationId}/departments`, { catalogKey: key });
      }
      if (customName.trim()) {
        await api.post(`/organizations/${organizationId}/departments`, { name: customName.trim() });
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Departman eklenemedi");
      setSaving(false);
    }
  };

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>Standart departmanlardan seç</span>
        <button onClick={onClose} aria-label="Kapat" style={{ background: "transparent", border: "none" }}>
          <IconX size={16} color={c.textSecondary} />
        </button>
      </div>

      {availableCatalog.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>Standart departmanların hepsi zaten eklenmiş.</p>
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

      <div>
        <label style={{ fontSize: 13, color: c.textSecondary }}>Ya da özel departman adı</label>
        <input
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          placeholder="Örn. Ar-Ge"
          style={{ width: "100%", marginTop: 4 }}
        />
      </div>

      {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ padding: "9px 0", borderRadius: 8, border: "none", background: c.primary, color: "#fff", fontSize: 14, fontWeight: 500 }}
      >
        {saving ? "Ekleniyor…" : "Departmanları ekle"}
      </button>
    </div>
  );
}
