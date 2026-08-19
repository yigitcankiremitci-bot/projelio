import { useRef, useState } from "react";
import type { Product } from "@projelio/shared";
import { api } from "../api/client";
import { resizeCoverImage } from "../lib/imageProcessing";
import { colors } from "../theme/colors";
import CardDescription from "./CardDescription";
import { IconFolder, IconCalendar, IconPlus } from "./icons";

interface Props {
  product: Product;
  onEdit: () => void;
  onCoverUpdated: (coverImageUrl?: string) => void;
}

// JobCard ile aynı görsel dil (kapak yüksekliği/kart yüksekliği HER ZAMAN sabit,
// hiç büyümez/küçülmez) — "Şirket anasayfasında ürün departmanından eklenen
// ürünler tıpkı iş kartları gibi görünsün". Ürün/hizmetlerin ayrı bir detay
// sayfası yok; karta tıklamak düzenleme modalını açar, açıklamaya tıklamaksa
// kartın boyutunu değiştirmeden açıklama alanını kendi içinde kaydırır.
const COVER_HEIGHT = 104;
const CARD_HEIGHT = 296;

function formatPrice(price?: number, currency?: string): string | null {
  if (price === undefined || price === null) return null;
  try {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: currency || "TRY" }).format(price);
  } catch {
    return `${price} ${currency ?? ""}`.trim();
  }
}

export default function ProductCard({ product, onEdit, onCoverUpdated }: Props) {
  const c = colors.light;
  const [coverUrl, setCoverUrl] = useState(product.coverImageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddCoverClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleCoverSelected = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    setUploadError(false);
    try {
      const resized = await resizeCoverImage(file);
      const formData = new FormData();
      formData.append("file", resized);
      const updated = await api.uploadFile<Product>(`/products/${product.id}/cover`, formData);
      setCoverUrl(updated.coverImageUrl);
      onCoverUpdated(updated.coverImageUrl);
    } catch {
      setUploadError(true);
      setTimeout(() => setUploadError(false), 3000);
    } finally {
      setUploading(false);
    }
  };

  const priceLabel = formatPrice(product.price, product.currency);

  return (
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
          background: coverUrl ? `center/cover url(${coverUrl})` : c.background,
          display: coverUrl ? undefined : "flex",
          alignItems: coverUrl ? undefined : "center",
          justifyContent: coverUrl ? undefined : "center",
        }}
      >
        {!coverUrl && <IconFolder size={26} color={c.border} />}

        {!coverUrl && (
          <button
            type="button"
            onClick={handleAddCoverClick}
            disabled={uploading}
            aria-label="Kapak fotoğrafı ekle"
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
            Yüklenemedi, tekrar dene
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            void handleCoverSelected(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <h3
          style={{
            margin: "0 0 6px",
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
        {product.description && (
          <CardDescription text={product.description} />
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 15, color: c.textSecondary, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <IconCalendar size={12} color={c.textSecondary} />
            <span>{new Date(product.createdAt).toLocaleDateString("tr-TR")} eklendi</span>
          </div>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 15,
            paddingTop: 10,
            borderTop: `1px solid ${c.border}`,
            color: priceLabel ? c.textPrimary : c.textSecondary,
            fontWeight: priceLabel ? 500 : 400,
          }}
        >
          <span>{priceLabel ?? "Fiyat belirtilmedi"}</span>
        </div>
      </div>
    </button>
  );
}
