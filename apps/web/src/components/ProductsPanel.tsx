import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Product } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useProjectFabAction } from "../lib/projectFab";
import ProductCard from "./ProductCard";
import AddEditProductModal from "./AddEditProductModal";
import { IconPlus } from "./icons";

export interface ProductsPanelHandle {
  openAdd: () => void;
}

interface Props {
  organizationId: string;
  // Verilirse (örn. Ürün Yönetimi departmanının detay sayfasından açıldığında)
  // buradan eklenen yeni ürünler otomatik olarak o departmana bağlanır.
  departmentId?: string;
  // Departman sayfasında bu panel Modüller ile birlikte gösterildiğinde, şirket
  // anasayfasında da Departmanlar/Modüller ile birlikteyken global "+" düğmesi
  // başka bir bileşene ait olur (bkz. DepartmentModulesPanel, OrganizationDetail)
  // — bu durumda ürün/hizmet ekleme kendi satır içi düğmesiyle ya da dışarıdan
  // ProductsPanelHandle.openAdd ile tetiklenir. Organizasyonun "Ürün/Hizmet"
  // sekmesinde (tek başına gösterildiğinde) varsayılan olarak FAB kullanılır.
  useFab?: boolean;
  // useFab=false iken satır içi "+ Ürün/Hizmet ekle" düğmesi normalde gösterilir;
  // Anasayfa'da bu düğme yerine tek, birleşik "+" menüsü var (bkz.
  // OrganizationDetail) — orada showAddButton=false verilip düğme tamamen
  // gizlenir, ekleme yalnızca ProductsPanelHandle.openAdd ile tetiklenir.
  showAddButton?: boolean;
}

// Ürün Yönetimi departmanından eklenen ürün/hizmetler; hem departman detayında hem de
// şirket Anasayfa sekmesinde (Departmanlar kartlarının üstünde, bkz.
// OrganizationDetail) ve ayrı "Ürün/Hizmet" sekmesinde iş kartlarıyla aynı
// görünümde (bkz. ProductCard) listelenir.
const ProductsPanel = forwardRef<ProductsPanelHandle, Props>(function ProductsPanel(
  { organizationId, departmentId, useFab = true, showAddButton = true },
  ref
) {
  const c = useThemeColors();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get<Product[]>(`/organizations/${organizationId}/products`)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [organizationId]);

  useImperativeHandle(ref, () => ({ openAdd: () => setAdding(true) }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {useFab && <ProductsFabRegistrar onAdd={() => setAdding(true)} deps={[organizationId, departmentId]} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0 }}>Ürün/Hizmet</h2>
        {!useFab && showAddButton && (
          <button
            onClick={() => setAdding(true)}
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: c.primary, background: "transparent", border: "none" }}
          >
            <IconPlus size={13} color={c.primary} />
            Ürün/Hizmet ekle
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
      ) : products.length === 0 ? (
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
          {useFab
            ? 'Henüz ürün/hizmet yok. Sağ alttaki "+" ile Ürün Yönetimi departmanına ürün/hizmet ekleyebilirsin.'
            : "Henüz ürün/hizmet yok."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
          {products.map((p) => (
            <ProductCard key={p.id} product={p} onEdit={() => setEditing(p)} onCoverUpdated={() => load()} />
          ))}
        </div>
      )}

      {adding && (
        <AddEditProductModal
          organizationId={organizationId}
          departmentId={departmentId}
          onClose={() => setAdding(false)}
          onSaved={load}
        />
      )}

      {editing && (
        <AddEditProductModal
          organizationId={organizationId}
          departmentId={editing.departmentId}
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          onArchived={() => {
            setEditing(null);
            load();
          }}
          onDeleted={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
});

export default ProductsPanel;

// useProjectFabAction'ı yalnızca FAB gerçekten kullanılacaksa çağırmak için ayrı
// bir bileşene alındı: bir hook'u koşullu çağırmak yerine, hook'u çağıran
// bileşeni koşullu render etmek React kurallarına uygun doğru yöntemdir. Bu
// sayede ProductsPanel departman sayfasında Modüller ile birlikteyken FAB'a
// hiç dokunmaz (aksi halde iki panel birbirinin "+" eylemini geçersiz kılardı).
function ProductsFabRegistrar({ onAdd, deps }: { onAdd: () => void; deps: unknown[] }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useProjectFabAction({ label: "Ürün/Hizmet ekle", onClick: onAdd }, deps);
  return null;
}
