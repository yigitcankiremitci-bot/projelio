import { useRef, useState } from "react";
import type { Product } from "@projelio/shared";
import { PRODUCT_UNIT_LABEL } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import CardDescription from "./CardDescription";
import ProductPhotoCropModal from "./ProductPhotoCropModal";
import { coverBackground, isCoverPreset } from "../lib/covers";
import { IconPlus } from "./icons";
import { useT } from "../lib/i18n";

interface Props {
  product: Product;
  onEdit: () => void;
  onCoverUpdated: (coverImageUrl?: string) => void;
}

// JobCard ile aynı görsel dil (kart yüksekliği HER ZAMAN sabit, hiç
// büyümez/küçülmez) — "Şirket anasayfasında ürün departmanından eklenen
// ürünler tıpkı iş kartları gibi görünsün". Ürün/hizmetlerin ayrı bir detay
// sayfası yok; karta tıklamak düzenleme modalını açar, açıklamaya tıklamaksa
// kartın boyutunu değiştirmeden açıklama alanını kendi içinde kaydırır.
//
// GÖRSEL ALANI İŞ KARTINDAN YÜKSEK. İş/proje kapağı bir afiş şeridi, ürün
// fotoğrafı ise ürünün kendisi: 104 px'lik şeritte bir sandalyenin yalnızca
// oturma yeri görünüyordu. 176 px, yüklenen 4:3 fotoğrafın (bkz.
// resizeProductImage) tamamını kırpmadan gösterecek kadar yer bırakıyor.
const COVER_HEIGHT = 176;
const CARD_HEIGHT = 368;

function formatPrice(price?: number, currency?: string): string | null {
  if (price === undefined || price === null) return null;
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(price);
  } catch {
    return `${price} ${currency ?? ""}`.trim();
  }
}

function formatStock(product: Product): string | null {
  if (product.stockQuantity === undefined || product.stockQuantity === null) return null;
  const miktar = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(product.stockQuantity);
  return product.unit ? `${miktar} ${PRODUCT_UNIT_LABEL[product.unit].toLocaleLowerCase("tr-TR")}` : miktar;
}

export default function ProductCard({ product, onEdit, onCoverUpdated }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [coverUrl, setCoverUrl] = useState(product.coverImageUrl);
  const [imageCount, setImageCount] = useState(product.images?.length ?? (product.coverImageUrl ? 1 : 0));
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  // Kırpma penceresinde bekleyen ham dosya. Karttan eklerken de modaldaki
  // akışın aynısı geçerli: yerleştirmeyi kullanıcı seçiyor.
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddCoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleCropped = async (hazir: File[]) => {
    setCropFile(null);
    const resized = hazir[0];
    if (!resized) return;
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      formData.append("file", resized);
      // Galeriye ekler; ürünün ilk fotoğrafıysa vitrin görseli de olur
      // (bkz. ProductsService.addImage).
      const updated = await api.uploadFile<Product>(`/products/${product.id}/images`, formData);
      setCoverUrl(updated.coverImageUrl);
      setImageCount(updated.images?.length ?? imageCount + 1);
      onCoverUpdated(updated.coverImageUrl);
    } catch (err) {
      // Sunucunun mesajı gösteriliyor: "Dosya bir görsel değil", "HEIC
      // desteklenmiyor" gibi ayrımlar kullanıcının ne yapacağını söylüyor,
      // tek tip "Yüklenemedi" ise söylemiyordu.
      setUploadError(err instanceof Error ? err.message : "Yüklenemedi, tekrar dene");
      setTimeout(() => setUploadError(""), 5000);
    } finally {
      setUploading(false);
    }
  };

  const priceLabel = formatPrice(product.price, product.currency);
  const stockLabel = formatStock(product);
  // Kullanıcının yüklediği gerçek bir fotoğraf mı, yoksa kimlikten türetilen
  // hazır kapak mı? Fotoğrafta <img> + contain kullanılıyor: arka plan olarak
  // çizilseydi CSS `cover` ürünün kenarlarını kırpardı.
  const photoUrl = coverUrl && !isCoverPreset(coverUrl) ? coverUrl : null;

  return (
    <>
      {/* Kırpma penceresi kartın <button> ağacının DIŞINDA: Modal portal ile
          body'ye taşınsa da, düğmenin içindeki bir alt ağaçta durması karta
          tıklama olaylarının içeriden sızmasına açık kapı bırakıyordu. */}
      {cropFile && (
        <ProductPhotoCropModal
          files={[cropFile]}
          onCancel={() => setCropFile(null)}
          onDone={(hazir) => void handleCropped(hazir)}
        />
      )}

    <button
      type="button"
      onClick={onEdit}
      className="entity-card"
      style={{
        display: "flex",
        flexDirection: "column",
        textAlign: "left",
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        overflow: "hidden",
        background: c.surface,
        height: CARD_HEIGHT,
      }}
    >
      <div
        style={{
          position: "relative",
          height: COVER_HEIGHT,
          flexShrink: 0,
          // Fotoğraf kutuyu tamamen kapladığı için zemin yalnızca yükleme anında
          // görünür; kart yüzeyiyle aynı kalsın ki karanlık modda beyaz bir
          // kare çakmasın.
          background: photoUrl ? c.surface : coverBackground(coverUrl, product.id),
        }}
      >
        {photoUrl && (
          <img
            src={photoUrl}
            alt=""
            // "cover", "contain" DEĞİL. Kartın görsel kutusu 4:3 değil: genişliği
            // ızgarayla değişiyor (en az 260 px), yüksekliği ise sabit 176 px —
            // yani oran 1.48 ve üzeri. 4:3'lük bir fotoğrafı bu kutuya
            // "contain" ile koymak, fotoğraf kusursuz doldurulmuş olsa bile
            // İKİ YANINDA beyaz bant bırakıyordu; bant fotoğraftan değil,
            // kutunun oranından geliyordu.
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        )}

        {/* Fotoğraf VARKEN de görünür: eskiden düğme yalnızca hiç kapak yokken
            çiziliyordu, yani karttan ikinci bir fotoğraf eklemenin ya da mevcut
            olanı değiştirmenin hiçbir yolu yoktu. */}
        <button
          type="button"
          onClick={handleAddCoverClick}
          disabled={uploading}
          aria-label={t("Ürün fotoğrafı ekle")}
          title={t("Ürün fotoğrafı ekle")}
          className="entity-card-cover-add"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 30,
            height: 30,
            borderRadius: "50%",
            border: "none",
            background: "rgba(26,31,41,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <IconPlus size={16} color="#fff" />
        </button>

        {imageCount > 1 && (
          <span
            style={{
              position: "absolute",
              left: 8,
              bottom: 8,
              padding: "2px 7px",
              borderRadius: 999,
              fontSize: 11.5,
              color: "#fff",
              background: "rgba(26,31,41,0.62)",
            }}
          >
            {imageCount} fotoğraf
          </span>
        )}

        {product.status === "inactive" && (
          <span
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              padding: "2px 7px",
              borderRadius: 999,
              fontSize: 11.5,
              color: "#fff",
              background: "rgba(26,31,41,0.62)",
            }}
          >
            {t("Satış dışı")}
          </span>
        )}

        {uploadError && (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "4px 8px",
              fontSize: 12,
              color: "#fff",
              background: c.danger,
              textAlign: "center",
            }}
          >
            {uploadError}
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            setCropFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <h3
          style={{
            margin: "0 0 2px",
            fontSize: 17,
            fontWeight: 500,
            color: c.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {product.name}
        </h3>

        {/* Marka · Kategori: ürünü listede ayırt etmenin en hızlı yolu, ikisi de
            boşsa satır hiç çizilmiyor ki kart boş bir aralıkla başlamasın. */}
        {(product.brand || product.category) && (
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 13.5,
              color: c.textSecondary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {[product.brand, product.category].filter(Boolean).join(" · ")}
          </p>
        )}

        {product.description && <CardDescription text={product.description} />}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, color: c.textSecondary, marginBottom: 10 }}>
          {product.sku && (
            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Kod: {product.sku}</div>
          )}
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
          }}
        >
          <span style={{ color: priceLabel ? c.textPrimary : c.textSecondary, fontWeight: priceLabel ? 500 : 400 }}>
            {priceLabel ?? "Fiyat belirtilmedi"}
          </span>
          {stockLabel && (
            <span style={{ color: c.textSecondary, whiteSpace: "nowrap" }}>{stockLabel}</span>
          )}
        </div>
      </div>
    </button>
    </>
  );
}
