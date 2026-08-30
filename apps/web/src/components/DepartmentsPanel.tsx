import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Department, DepartmentCatalogEntry } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { onEnter } from "../lib/enterAction";
import { useSortableList } from "../lib/useSortableList";
import { useLatestRef, useRefreshOnUndo, useReorderUndo } from "../lib/undo";
import DepartmentCard from "./DepartmentCard";
import { IconX } from "./icons";
import { useDragScroll } from "../lib/useDragScroll";

export interface DepartmentsPanelHandle {
  openAdd: () => void;
}

interface Props {
  organizationId: string;
  // Şirket anasayfasında "+" beş kısayolu birden taşıyan tek bir menü açıyor
  // (bkz. OrganizationDetail HomeAddFabRegistrar) ve "Departman kur" orada zaten
  // var; ikinci kez kaydedilmesin diye orada useFab=false verilir ve ekleme
  // DepartmentsPanelHandle.openAdd ile tetiklenir (ProductsPanel'deki desenin aynısı).
  useFab?: boolean;
  // "scroll" (varsayılan): Anasayfa özetindeki gibi tek satır, yana kaydırmalı,
  // kompakt kartlar. "grid": ayrı Departmanlar sekmesindeki gibi satıra sığdığı
  // kadar yan yana dizilip taşınca alt satıra geçen, daha büyük kartlar —
  // burada basılı tutup sürükleyerek sıralama da açık (bkz. useSortableList).
  layout?: "scroll" | "grid";
}

// Anasayfa özetinde (layout="scroll") departmanlar tek satırda, sabit genişlikli
// kartlarla listelenir; sığmadığında yana kaydırarak seçilebilir. Departmanlar
// sekmesinde (layout="grid") kartlar daha büyük ve satıra sığdığı kadar yan yana
// dizilip taşınca alt satıra geçer, yana kaydırma yok. Her karta tıklamak
// departmanın kendi sayfasına (kadro yönetimi, varsa ürünler) götürür.
const DepartmentsPanel = forwardRef<DepartmentsPanelHandle, Props>(function DepartmentsPanel(
  { organizationId, useFab = true, layout = "scroll" },
  ref
) {
  const c = useThemeColors();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [catalog, setCatalog] = useState<DepartmentCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useDragScroll<HTMLDivElement>(layout === "scroll");
  const registerReorderUndo = useReorderUndo();
  const departmentsRef = useLatestRef(departments);

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
  // Geri/ileri alma sunucu durumunu değiştirir; liste kendini tazelemeli.
  useRefreshOnUndo(load);

  useImperativeHandle(ref, () => ({ openAdd: () => setAdding(true) }));

  // Yalnızca grid görünümünde (Departmanlar sekmesi) basılı tutup sürükleyerek
  // sıralama açık — listRef yalnızca o modda DOM öğesine bağlanır (bkz. JSX),
  // scroll modunda containerRef.current null kalır ve hook no-op olur.
  useSortableList(
    listRef,
    {
      onEnd: () => {
        const el = listRef.current;
        if (!el) return;
        const ids = Array.from(el.children)
          .map((node) => (node as HTMLElement).dataset.id!)
          .filter(Boolean);
        const endpoint = `/organizations/${organizationId}/departments/reorder`;
        const previousIds = departmentsRef.current.map((d) => d.id);
        setDepartments((prev) => {
          const byId = new Map(prev.map((d) => [d.id, d]));
          return ids.map((id) => byId.get(id)!).filter(Boolean);
        });
        api.patch(endpoint, { ids }).catch(() => load());
        registerReorderUndo(endpoint, previousIds, ids, load);
      },
    },
    [layout, departments.length === 0]
  );

  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    useFab && fabAvailable ? { label: "Departman ekle", onClick: () => setAdding((v) => !v) } : null,
    [useFab, fabAvailable, organizationId],
    FAB_PRIORITY.panel
  );

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
          ref={layout === "grid" ? listRef : scrollRef}
          style={
            layout === "grid"
              ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }
              : {
                  display: "flex",
                  flexWrap: "nowrap",
                  gap: 14,
                  overflowX: "auto",
                  paddingBottom: 6,
                  WebkitOverflowScrolling: "touch",
                }
          }
        >
          {departments.map((dept) => (
            <div
              key={dept.id}
              data-id={dept.id}
              style={layout === "grid" ? undefined : { flex: "0 0 260px", width: 260 }}
            >
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
  const c = useThemeColors();
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
          onKeyDown={onEnter(() => void handleSave())}
          placeholder="Örn. Ar-Ge"
          style={{ width: "100%", marginTop: 4 }}
        />
      </div>

      {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ padding: "9px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14, fontWeight: 500 }}
      >
        {saving ? "Ekleniyor…" : "Departmanları ekle"}
      </button>
    </div>
  );
}
