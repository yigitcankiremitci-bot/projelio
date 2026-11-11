import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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
import UrunExcelModal from "./UrunExcelModal";
import UrunFotoTopluModal from "./UrunFotoTopluModal";
import UrunKatalogu from "./urunler/UrunKatalogu";
import { IconImage, IconUpload } from "./icons";
import { useT } from "../lib/i18n";
import { DOKUNMATIK_CIHAZ } from "../lib/dokunmatikCihaz";
import { useModulGeriHapi } from "../lib/modulGeri";

const SERIT_TAVANI = 24;

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
  // Başlık satırının en sağına konan ek öğe — şirket anasayfasında bölümü
  // yukarı/aşağı taşıyan oklar (bkz. OrganizationDetail, lib/anasayfaSirasi).
  basliktaSag?: ReactNode;
}

// Ürün Yönetimi departmanından eklenen ürün/hizmetler; hem departman detayında hem de
// şirket Anasayfa sekmesinde (Departmanlar kartlarının üstünde, bkz.
// OrganizationDetail) ve ayrı "Ürün/Hizmet" sekmesinde iş kartlarıyla aynı
// görünümde (bkz. ProductCard) listelenir.
const ProductsPanel = forwardRef<ProductsPanelHandle, Props>(function ProductsPanel(
  { organizationId, departmentId, useFab = true, layout = "scroll", basliktaSag },
  ref
) {
  const c = useThemeColors();
  const t = useT();
  const scrollRef = useDragScroll<HTMLDivElement>(layout === "scroll");
  const isDesktop = useIsDesktop();
  // Üst üste binen deste (ProductStack) YALNIZCA dokunmatik cihazda. Eskiden
  // tek ölçüt genişlikti (<880 px): küçük ekranlı ya da yakınlaştırılmış bir
  // dizüstünde deste açılıyor, kartlar fareyle iç içe geçmiş görünüyordu
  // (2026-10-13). Dizüstü dar da olsa düz, kaydırmalı satırı görür.
  const compactCards = layout === "scroll" && !isDesktop && DOKUNMATIK_CIHAZ;
  const cardWidth = 260;
  // Küçültme yalnızca anasayfa şeridinde: ayrı Ürün/Hizmet sekmesinde
  // listeyi gizlemek sekmenin kendisini anlamsızlaştırırdı.
  const collapsible = layout === "scroll";
  const [collapsed, toggleCollapsed] = useKatlanirBolum("projelio.anasayfa-urunler-kapali", collapsible);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [excelAcik, setExcelAcik] = useState(false);
  const [fotoAcik, setFotoAcik] = useState(false);
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

  // Anasayfa şeridi bir ÖZET: 3.586 ürünlük katalogda şerit binlerce fotoğraflı
  // kartı yan yana çiziyor, sayfa açılırken donuyordu (2026-11-11). İlk
  // SERIT_TAVANI kart yeter; arama ve geri kalanı Ürün/Hizmet sekmesinde.
  const serit = layout === "scroll" ? products.slice(0, SERIT_TAVANI) : products;

  useImperativeHandle(ref, () => ({ openAdd: () => setAdding(true) }));

  // Modül sayfasında (ModulePage) geri hapı katalogun üst satırına alınır ve
  // "Ürün/Hizmet" başlığı yazılmaz: başlık zaten üst şeritte. Üstte beş satır
  // (geri, başlık + toplu düğmeler, arama, çipler, kayıt sayısı) listeyi
  // aşağı itiyordu (kullanıcı isteği, 2026-11-11 — Müşteriler'le aynı kural).
  const geriHapi = useModulGeriHapi();
  const izgara = layout === "grid";
  // Toplu düğmeler katalog varken onun üst satırında; boş katalogda (ilk
  // Excel aktarımı) başlık satırında kalır.
  const katalogda = izgara && !loading && products.length > 0;
  const topluDugme: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  // Toplu ekleme yalnızca ızgara görünümünde (departman sayfası ve Ürün/Hizmet
  // sekmesi): anasayfa şeridi bir özet, katalog orada yönetilmiyor. Yetkiyi
  // sunucu tek tek eklemeyle aynı kuralla verir.
  const topluDugmeler = izgara && (
    <>
      {/* Telefonda yalnızca simge: yazılı hâlleri çiplerin altında kendi
          satırını kaplıyordu. */}
      <button onClick={() => setExcelAcik(true)} title={t("Excel ile toplu ürün/hizmet ekle")} aria-label={t("Excel ile toplu ekle")} style={topluDugme}>
        <IconUpload size={15} /> {isDesktop && t("Excel ile toplu ekle")}
      </button>
      {/* Fotoğraflar ürünler açıldıktan sonra, adlarındaki stok koduyla eklenir. */}
      {products.length > 0 && (
        <button onClick={() => setFotoAcik(true)} title={t("Adı stok kodu olan fotoğrafları ürünlere ekle")} aria-label={t("Toplu fotoğraf")} style={topluDugme}>
          <IconImage size={15} /> {isDesktop && t("Toplu fotoğraf")}
        </button>
      )}
    </>
  );
  const baslikSatiri = !(katalogda && geriHapi);

  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    useFab && fabAvailable ? { label: t("Ürün/Hizmet ekle"), onClick: () => setAdding(true) } : null,
    [useFab, fabAvailable, organizationId, departmentId],
    FAB_PRIORITY.panel
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {baslikSatiri && (
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {izgara && geriHapi ? (
          geriHapi
        ) : (
          // Çift dokunuş "Ürün/Hizmet ekle" penceresini açar (bkz. DepartmentsPanel başlığı).
          <h2
            onDoubleClick={() => setAdding(true)}
            title={t("Eklemek için çift tıkla")}
            style={{ fontSize: 18, fontWeight: 500, color: c.textPrimary, margin: 0, userSelect: "none", cursor: "default", touchAction: "manipulation" }}
          >
            {t("Ürün/Hizmet")}
          </h2>
        )}
        {!katalogda && topluDugmeler && <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>{topluDugmeler}</span>}
        {collapsible && (
          <SectionToggle
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            count={loading ? undefined : products.length}
            showLabel={t("Ürün/hizmetleri göster")}
            hideLabel={t("Ürün/hizmetleri gizle")}
          />
        )}
        {basliktaSag && <div style={{ marginLeft: "auto" }}>{basliktaSag}</div>}
      </div>
      )}

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
      ) : layout === "grid" ? (
        // Tam katalog: arama, kategori/marka, filtre, sıralama, görünüm.
        <UrunKatalogu
          organizationId={organizationId}
          products={products}
          onOpen={setOpen}
          onCoverUpdated={load}
          ustSol={geriHapi ?? undefined}
          ustEylemler={topluDugmeler || undefined}
        />
      ) : compactCards ? (
        <ProductStack products={serit} onOpen={setOpen} onCoverUpdated={load} />
      ) : (
        <div
          ref={scrollRef}
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 14,
            overflowX: "auto",
            paddingBottom: 6,
            WebkitOverflowScrolling: "touch",
          }}
        >
          {serit.map((p) => (
            // Kaydırmalı satırda kart genişliği SABİT: flex öğeleri varsayılan
            // olarak büzülüyor ve otuz ürün eklendiğinde hepsi satıra sıkışıp
            // okunamaz hale geliyordu (bkz. DepartmentsPanel'deki aynı ölçü).
            <div key={p.id} style={{ flex: `0 0 ${cardWidth}px`, width: cardWidth }}>
              <ProductCard product={p} onOpen={() => setOpen(p)} onCoverUpdated={() => load()} />
            </div>
          ))}
          {products.length > serit.length && (
            <div
              style={{
                flex: "0 0 160px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                color: c.textSecondary,
                fontSize: 14,
                border: `1px dashed ${c.border}`,
                borderRadius: 12,
                padding: 12,
              }}
            >
              {t("+{n} ürün/hizmet daha — tamamı Ürün/Hizmet sekmesinde", { n: (products.length - serit.length).toLocaleString("tr-TR") })}
            </div>
          )}
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

      {excelAcik && (
        <UrunExcelModal
          organizationId={organizationId}
          departmentId={departmentId}
          onClose={() => setExcelAcik(false)}
          onDone={load}
        />
      )}

      {fotoAcik && <UrunFotoTopluModal products={products} onClose={() => setFotoAcik(false)} onDone={load} />}

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
