import { useState } from "react";
import type { Product } from "@projelio/shared";
import { api } from "../api/client";
import { colors } from "../theme/colors";
import Modal from "./Modal";
import EntityDangerZone from "./EntityDangerZone";

interface Props {
  organizationId: string;
  departmentId?: string;
  product?: Product;
  onClose: () => void;
  onSaved: () => void;
  onArchived?: () => void;
  onDeleted?: () => void;
}

// Ürün Yönetimi departmanından eklenen ürünler için oluşturma/düzenleme modalı
// (CreateJobModal/EditJobModal deseni). Kapak fotoğrafı kart üzerinden eklenir.
export default function AddEditProductModal({
  organizationId,
  departmentId,
  product,
  onClose,
  onSaved,
  onArchived,
  onDeleted,
}: Props) {
  const c = colors.light;
  const isEdit = !!product;
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [price, setPrice] = useState(product?.price !== undefined ? String(product.price) : "");
  const [currency, setCurrency] = useState(product?.currency ?? "TRY");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmedPrice = price.trim();
    const priceValue = trimmedPrice ? Number(trimmedPrice.replace(",", ".")) : undefined;
    if (trimmedPrice && Number.isNaN(priceValue)) {
      setError("Geçerli bir fiyat gir");
      return;
    }

    setLoading(true);
    try {
      if (isEdit && product) {
        await api.patch(`/products/${product.id}`, {
          name,
          description: description || undefined,
          price: priceValue,
          currency,
        });
      } else {
        await api.post(`/organizations/${organizationId}/products`, {
          departmentId,
          name,
          description: description || undefined,
          price: priceValue,
          currency,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ürün/hizmet kaydedilemedi. Tekrar dene.");
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!product) return;
    await api.patch(`/products/${product.id}/archive`, {});
    onArchived?.();
  };

  const handleDelete = async () => {
    if (!product) return;
    await api.delete(`/products/${product.id}`);
    onDeleted?.();
  };

  return (
    <Modal title={isEdit ? "Ürün/Hizmeti düzenle" : "Yeni ürün/hizmet"} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Ürün/Hizmet adı</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 15, color: c.textSecondary }}>Açıklama</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Kısa açıklama (opsiyonel)"
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 2 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Fiyat</label>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Opsiyonel"
              inputMode="decimal"
              style={{ width: "100%" }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
            <label style={{ fontSize: 15, color: c.textSecondary }}>Para birimi</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: "100%" }}>
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>

        {error && <p style={{ color: c.danger, fontSize: 16, margin: 0 }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ marginTop: 4, background: c.primary, color: "#fff", padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {loading ? "Kaydediliyor…" : isEdit ? "Kaydet" : "Ürün/Hizmet oluştur"}
        </button>
      </form>

      {isEdit && (
        <EntityDangerZone
          entityLabel="Ürün/Hizmeti"
          onArchive={onArchived ? handleArchive : undefined}
          onDelete={onDeleted ? handleDelete : undefined}
          archiveMessage={`"${product?.name}" ürün/hizmetini arşive eklemek istediğine emin misin?`}
          deleteMessage={`"${product?.name}" ürün/hizmetini silmek istediğine emin misin? Bu işlem geri alınamaz.`}
        />
      )}
    </Modal>
  );
}
