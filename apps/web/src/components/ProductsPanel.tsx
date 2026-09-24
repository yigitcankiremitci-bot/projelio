import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { Product } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { useDragScroll } from "../lib/useDragScroll";
import ProductCard from "./ProductCard";
import ProductStack from "./ProductStack";
import SectionToggle from "./SectionToggle";
import { useKatlanirBolum } from "../lib/useKatlanirBolum";
import { useIsDesktop } from "../lib/useIsDesktop";
import AddEditProductModal from "./AddEditProductModal";
import ProductDetailModal from "./ProductDetailModal";
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
  const isDesktop = useIsDesktop();
  const compactCards = layout === "scroll" && !isDesktop;
  const cardWidth = 260;
  // Küçültme yalnızca anasayfa şeridinde: ayrı Ürün/Hizmet sekmesinde
  // listeyi gizlemek sekmenin kendisini anlamsızlaştırırdı.
  const collapsible = layout === "scroll";
  const [collapsed, toggleCollapsed] = useKatlanirBolum("projelio.anasayfa-urunler-kapali", collapsible);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  // Açık ürün kartı. Karta tıklamak artık düzenleme formunu değil ürün kartını
  // açar; düzenleme kartın "Bilgiler" sekmesinde (bkz. ProductDetailModal).
  const [open, setOpen] = useState<Product | null>(null);

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
    useFab && fabAvailable ? { label: t("Ürün/Hizmet ekle"), onClick: () => setAdding(true) } : null,
    [useFab, fabAvailable, organizationId, departmentId],
    FAB_PRIORITY.panel
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {/* Çift dokunuş "Ürün/Hizmet ekle" penceresini açar (bkz. DepartmentsPanel başlığı). */}
        <h2
          onDoubleClick={() => setAdding(true)}
          title={t("Eklemek için çift tıkla")}
          style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0, userSelect: "none", cursor: "default", touchAction: "manipulation" }}
        >
          {t("Ürün/Hizmet")}
        </h2>
        {collapsible && (
          <SectionToggle
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            count={loading ? undefined : products.length}
            showLabel={t("Ürün/hizmetleri göster")}
            hideLabel={t("Ürün/hizmetleri gizle")}
          />
        )}
      </div>

      {collapsed ? null : loading ? (
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
          {t('Henüz ürün/hizmet yok. Sayfadaki "+" ile Ürün Yönetimi departmanına ürün/hizmet ekleyebilirsin.')}
        </div>
      ) : compactCards ? (
        <ProductStack products={products} onOpen={setOpen} onCoverUpdated={load} />
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
            <div
              key={p.id}
              style={layout === "grid" ? undefined : { flex: `0 0 ${cardWidth}px`, width: cardWidth }}
            >
              <ProductCard product={p} onOpen={() => setOpen(p)} onCoverUpdated={() => load()} />
            </div>
          ))}
        </div>
      )}

      {adding && (
        <AddEditProductModal
          organizationId={organizationId}
          departmentId={departmentId}
          onClose={() => setAdding(false)}
          onSaved={(olusan) => {
            load();
            // Yeni ürünün kartı hemen açılsın: strateji ve eksik bilgiler oradan
            // tamamlanıyor, kullanıcı ürünü listede aramak zorunda kalmasın.
            setOpen(olusan);
          }}
        />
      )}

      {open && (
        <ProductDetailModal
          key={open.id}
          organizationId={organizationId}
          product={open}
          onClose={() => setOpen(null)}
          onChanged={load}
          onArchived={() => {
            setOpen(null);
            load();
          }}
          onDeleted={() => {
            setOpen(null);
            load();
          }}
        />
      )}
    </div>
  );
});

export default ProductsPanel;
