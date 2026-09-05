import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Product } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { useDragScroll } from "../lib/useDragScroll";
import ProductCard from "./ProductCard";
import AddEditProductModal from "./AddEditProductModal";
import { useT } from "../lib/i18n";

export interface ProductsPanelHandle {
  openAdd: () => void;
}

interface Props {
  organizationId: string;
  // Verilirse (örn. Ürün Yönetimi departmanının detay sayfasından açıldığında)
  // buradan eklenen yeni ürünler otomatik olarak o departmana bağlanır.
  departmentId?: string;
  // Panel "+"a kendi eylemini kaydeder. Yalnızca eklemenin BAŞKA bir menüden
  // sunulduğu yerde kapatılır: şirket Anasayfası'nda "+" beş kısayolu birden
  // taşıyan tek bir menü açıyor (bkz. OrganizationDetail HomeAddFabRegistrar) ve
  // "Ürün ekle" orada zaten var — ikinci kez kaydedilirse menüde iki kere çıkardı.
  useFab?: boolean;
  // "scroll" (varsayılan): Anasayfa özetindeki gibi TEK SATIR, yana kaydırmalı.
  // "grid": ayrı Ürün/Hizmet sekmesindeki gibi satıra sığdığı kadar yan yana
  // dizilip taşınca alt satıra geçen ızgara. DepartmentsPanel'deki aynı prop ile
  // birebir aynı anlamda — ikisi anasayfada alt alta duruyor, davranışları da
  // aynı adla anlatılsın.
  layout?: "scroll" | "grid";
}

// Ürün Yönetimi departmanından eklenen ürün/hizmetler; hem departman detayında hem de
// şirket Anasayfa sekmesinde (Departmanlar kartlarının üstünde, bkz.
// OrganizationDetail) ve ayrı "Ürün/Hizmet" sekmesinde iş kartlarıyla aynı
// görünümde (bkz. ProductCard) listelenir.
const ProductsPanel = forwardRef<ProductsPanelHandle, Props>(function ProductsPanel(
  { organizationId, departmentId, useFab = true, layout = "scroll" },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const scrollRef = useDragScroll<HTMLDivElement>(layout === "scroll");
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

  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    useFab && fabAvailable ? { label: "Ürün/Hizmet ekle", onClick: () => setAdding(true) } : null,
    [useFab, fabAvailable, organizationId, departmentId],
    FAB_PRIORITY.panel
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{t("Ürün/Hizmet")}</h2>

      {loading ? (
        <p style={{ fontSize: 15, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
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
          {'Henüz ürün/hizmet yok. Sayfadaki "+" ile Ürün Yönetimi departmanına ürün/hizmet ekleyebilirsin.'}
        </div>
      ) : (
        <div
          ref={scrollRef}
          style={
            layout === "grid"
              ? { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }
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
          {products.map((p) => (
            // Kaydırmalı satırda kart genişliği SABİT: flex öğeleri varsayılan
            // olarak büzülüyor ve otuz ürün eklendiğinde hepsi satıra sıkışıp
            // okunamaz hale geliyordu (bkz. DepartmentsPanel'deki aynı ölçü).
            <div key={p.id} style={layout === "grid" ? undefined : { flex: "0 0 260px", width: 260 }}>
              <ProductCard product={p} onEdit={() => setEditing(p)} onCoverUpdated={() => load()} />
            </div>
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
