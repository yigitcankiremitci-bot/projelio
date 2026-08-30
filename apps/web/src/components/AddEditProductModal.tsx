import { useState } from "react";
import type { Product, ProductStatus, ProductUnit } from "@projelio/shared";
import { PRODUCT_STATUS_LABEL, PRODUCT_UNIT_LABEL, PRODUCT_UNITS } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";
import ProductImagesEditor from "./ProductImagesEditor";

interface Props {
  organizationId: string;
  departmentId?: string;
  product?: Product;
  onClose: () => void;
  onSaved: () => void;
  onArchived?: () => void;
  onDeleted?: () => void;
}

/**
 * Ürün/hizmet oluşturma ve düzenleme.
 *
 * Alanlar dört öbeğe ayrıldı çünkü hepsi tek bir listede alt alta dizilince
 * form "hangisi zorunlu, hangisi muhasebe işi" ayrımını kaybediyordu. Ad
 * dışında hiçbiri zorunlu değil: hizmet satan biri için stok ve barkod
 * anlamsız, ürün satan biri için vazgeçilmez — form ikisini de zorlamıyor.
 */
export default function AddEditProductModal({
  organizationId,
  departmentId,
  product,
  onClose,
  onSaved,
  onArchived,
  onDeleted,
}: Props) {
  const c = useThemeColors();
  const isEdit = !!product;

  // Fotoğraf galerisi ürünün kendi uçlarıyla ANINDA değişiyor (yükleme/silme
  // "Kaydet"i beklemez), bu yüzden modal ürünün güncel halini kendi state'inde
  // tutuyor; aksi halde bir fotoğraf silindikten sonra şeritte silinmiş görsel
  // durmaya devam ederdi.
  const [current, setCurrent] = useState<Product | undefined>(product);

  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? "active");

  const [sku, setSku] = useState(product?.sku ?? "");
  const [barcode, setBarcode] = useState(product?.barcode ?? "");

  const [price, setPrice] = useState(product?.price !== undefined ? String(product.price) : "");
  const [currency, setCurrency] = useState(product?.currency ?? "TRY");
  const [costPrice, setCostPrice] = useState(product?.costPrice !== undefined ? String(product.costPrice) : "");
  const [taxRate, setTaxRate] = useState(product?.taxRate !== undefined ? String(product.taxRate) : "");

  const [stockQuantity, setStockQuantity] = useState(
    product?.stockQuantity !== undefined ? String(product.stockQuantity) : ""
  );
  const [unit, setUnit] = useState<ProductUnit | "">(product?.unit ?? "");

  const [productUrl, setProductUrl] = useState(product?.productUrl ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");

  // Ürün henüz yokken seçilen fotoğraflar: kaydedilene kadar burada bekler,
  // ürün oluşturulduktan sonra sırayla yüklenir.
  const [pendingImages, setPendingImages] = useState<File[]>([]);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  /** Boş metni `null` yapar: sunucuda "dokunma" (undefined) ile "temizle" ayrımı buna bağlı. */
  const metin = (value: string) => (value.trim() ? value.trim() : null);
  const sayi = (value: string) => (value.trim() ? value.trim().replace(",", ".") : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const gövde = {
      name,
      description: metin(description),
      category: metin(category),
      brand: metin(brand),
      status,
      sku: metin(sku),
      barcode: metin(barcode),
      price: sayi(price),
      currency,
      costPrice: sayi(costPrice),
      taxRate: sayi(taxRate),
      stockQuantity: sayi(stockQuantity),
      unit: unit || null,
      productUrl: metin(productUrl),
      notes: metin(notes),
    };

    try {
      if (isEdit && current) {
        await api.patch(`/products/${current.id}`, gövde);
      } else {
        const olusan = await api.post<Product>(`/organizations/${organizationId}/products`, {
          departmentId,
          ...gövde,
        });
        // Ürün oluştuktan SONRA fotoğraflar: yükleme uçları ürün kimliği
        // istiyor. Sırayla gönderiliyor ki sıraları seçilen sırayla aynı olsun.
        for (const file of pendingImages) {
          const formData = new FormData();
          formData.append("file", file);
          await api.uploadFile<Product>(`/products/${olusan.id}/images`, formData);
        }
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ürün/hizmet kaydedilemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!current) return;
    await api.patch(`/products/${current.id}/archive`, {});
    onArchived?.();
  };

  // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz. resourcePath);
  // burada yalnızca silme sonrası arayüz davranışı kalır.
  const handleDelete = async () => {
    if (!current) return;
    onDeleted?.();
  };

  const alan = (etiket: string, girdi: React.ReactNode, genislik = 1) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: genislik, minWidth: 0 }}>
      <label style={{ fontSize: 15, color: c.textSecondary }}>{etiket}</label>
      {girdi}
    </div>
  );

  const baslik = (metin: string) => (
    <h3 style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 600, letterSpacing: 0.3, color: c.textSecondary, textTransform: "uppercase" }}>
      {metin}
    </h3>
  );

  return (
    <Modal title={isEdit ? "Ürün/Hizmeti düzenle" : "Yeni ürün/hizmet"} onClose={onClose} maxWidth={720}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ProductImagesEditor
          productId={current?.id}
          images={current?.images ?? []}
          pending={pendingImages}
          onPendingChange={setPendingImages}
          onChanged={(guncel) => {
            setCurrent(guncel);
            // Alttaki liste de tazelensin: kart, kaydedilmeyi beklemeden yeni
            // vitrin görselini göstersin.
            onSaved();
          }}
        />

        {baslik("Temel")}

        {alan(
          "Ürün/Hizmet adı",
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
        )}

        {alan(
          "Açıklama",
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ürünü/hizmeti anlatan metin (opsiyonel)"
            rows={8}
            style={cokSatirliStil}
          />
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {alan(
            "Kategori",
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Örn. Mobilya"
              style={{ width: "100%" }}
            />
          )}
          {alan(
            "Marka",
            <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
          )}
          {alan(
            "Durum",
            <select value={status} onChange={(e) => setStatus(e.target.value as ProductStatus)} style={{ width: "100%" }}>
              {(Object.keys(PRODUCT_STATUS_LABEL) as ProductStatus[]).map((key) => (
                <option key={key} value={key}>
                  {PRODUCT_STATUS_LABEL[key]}
                </option>
              ))}
            </select>
          )}
        </div>

        {baslik("Kodlar")}

        <div style={{ display: "flex", gap: 10 }}>
          {alan(
            "Stok kodu (SKU)",
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Şirket içinde benzersiz"
              style={{ width: "100%" }}
            />
          )}
          {alan(
            "Barkod",
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Opsiyonel" style={{ width: "100%" }} />
          )}
        </div>

        {baslik("Fiyat")}

        <div style={{ display: "flex", gap: 10 }}>
          {alan(
            "Satış fiyatı",
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Opsiyonel"
              inputMode="decimal"
              style={{ width: "100%" }}
            />,
            2
          )}
          {alan(
            "Para birimi",
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: "100%" }}>
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          )}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {alan(
            "Maliyet",
            <input
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="Opsiyonel"
              inputMode="decimal"
              style={{ width: "100%" }}
            />,
            2
          )}
          {alan(
            "KDV (%)",
            <input
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              placeholder="20"
              inputMode="decimal"
              style={{ width: "100%" }}
            />
          )}
        </div>

        {baslik("Stok")}

        <div style={{ display: "flex", gap: 10 }}>
          {alan(
            "Stok miktarı",
            <input
              value={stockQuantity}
              onChange={(e) => setStockQuantity(e.target.value)}
              placeholder="Hizmetlerde boş bırakılabilir"
              inputMode="decimal"
              style={{ width: "100%" }}
            />,
            2
          )}
          {alan(
            "Birim",
            <select value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit | "")} style={{ width: "100%" }}>
              <option value="">—</option>
              {PRODUCT_UNITS.map((key) => (
                <option key={key} value={key}>
                  {PRODUCT_UNIT_LABEL[key]}
                </option>
              ))}
            </select>
          )}
        </div>

        {baslik("Ek bilgi")}

        {alan(
          "Ürün adresi",
          <input
            value={productUrl}
            onChange={(e) => setProductUrl(e.target.value)}
            placeholder="https://… (tanıtım ya da satış sayfası)"
            style={{ width: "100%" }}
          />
        )}

        {alan(
          "İç not",
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Yalnızca şirket içinde görünür (tedarikçi, raf yeri, uyarı…)"
            rows={3}
            style={cokSatirliStil}
          />
        )}

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Ürün/Hizmet oluştur"}
        </button>
      </form>

      {isEdit && (
        <EntityDangerZone
          entityLabel="Ürün/Hizmeti"
          resourcePath={current ? `/products/${current.id}` : undefined}
          onArchive={onArchived ? handleArchive : undefined}
          onDelete={onDeleted ? handleDelete : undefined}
          archiveMessage={`"${current?.name}" ürün/hizmetini arşive eklemek istediğine emin misin?`}
          deleteMessage={`"${current?.name}" ürün/hizmetini silmek istediğine emin misin? Bu işlem geri alınamaz.`}
        />
      )}
    </Modal>
  );
}

/**
 * Çok satırlı alanların kutu stili.
 *
 * `height: "auto"` ŞART. index.css'teki genel kural `input, select, textarea`
 * için `height: 42px` veriyor; bu, textarea'nın `rows` özniteliğini eziyor ve
 * sekiz satırlık bir alan bile tek satır yüksekliğinde çiziliyor. Yüksekliği
 * `auto`ya çekince yüksekliği yine `rows` belirliyor.
 *
 * Dikey dolgu da aynı genel kuraldan geliyor (`padding: 0 12px`): tek satırlık
 * bir input'ta doğru, çok satırlıda ilk satırı kutunun tam üst kenarına
 * yapıştırıyor.
 */
const cokSatirliStil: React.CSSProperties = {
  width: "100%",
  height: "auto",
  padding: "10px 12px",
  lineHeight: 1.5,
  resize: "vertical",
  fontFamily: "inherit",
  fontSize: "inherit",
};
