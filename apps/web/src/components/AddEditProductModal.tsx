import { useState } from "react";
import type { Product } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ProductForm from "./ProductForm";
import { useT } from "../lib/i18n";

interface Props {
  organizationId: string;
  departmentId?: string;
  onClose: () => void;
  /** Oluşan ürünle çağrılır — liste tazelenir, istenirse ürün kartı açılır. */
  onSaved: (product: Product) => void;
}

const FORM_ID = "urun-olustur-formu";

/**
 * Yeni ürün/hizmet.
 *
 * Mevcut bir ürünün DÜZENLENMESİ artık burada değil, ürün kartının "Bilgiler"
 * sekmesinde (bkz. ProductDetailModal). İkisi aynı formu kullanır
 * (ProductForm); bu modal yalnızca onu bir pencereye koyar.
 */
export default function AddEditProductModal({ organizationId, departmentId, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      title={t("Yeni ürün/hizmet")}
      onClose={onClose}
      maxWidth={820}
      mobileFullScreen
      footer={
        <button
          type="submit"
          form={FORM_ID}
          disabled={busy}
          style={{ width: "100%", background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
        >
          {busy ? t("Kaydediliyor…") : t("Ürün/Hizmet oluştur")}
        </button>
      }
    >
      <ProductForm
        formId={FORM_ID}
        organizationId={organizationId}
        departmentId={departmentId}
        onBusyChange={setBusy}
        onSaved={(product) => {
          onSaved(product);
          onClose();
        }}
      />
    </Modal>
  );
}
