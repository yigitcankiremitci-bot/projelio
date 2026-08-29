import { useEffect, useRef, useState } from "react";
import type { Product, ProductImage } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import ProductPhotoCropModal from "./ProductPhotoCropModal";
import { IconChevronLeft, IconChevronRight, IconPlus, IconStar, IconTrash } from "./icons";
import { useDragScroll } from "../lib/useDragScroll";

/** Servisteki sınırla aynı (bkz. ProductsService.MAX_IMAGES_PER_PRODUCT). */
const MAX_IMAGES = 12;
const THUMB_WIDTH = 104;
const THUMB_HEIGHT = 78;

interface Props {
  /**
   * Ürün henüz kaydedilmediyse YOK. O durumda seçilen dosyalar sunucuya
   * gönderilmez, `pending` listesinde bekletilir ve ürün oluşturulduktan sonra
   * modal tarafından yüklenir (bkz. AddEditProductModal).
   */
  productId?: string;
  images: ProductImage[];
  /** Kaydedilmemiş üründe bekleyen dosyalar. */
  pending: File[];
  onPendingChange: (files: File[]) => void;
  /** Sunucu tarafı bir değişiklik olduğunda güncel ürünü verir. */
  onChanged: (product: Product) => void;
}

/**
 * Ürünün fotoğraf galerisi: ekleme, silme, sıralama.
 *
 * NEDEN MODALDA. Fotoğraf eklemenin tek yolu kartın üzerinde, yalnızca fare
 * kartın üstündeyken beliren küçük bir "+" düğmesiydi ve o düğme de SADECE
 * hiç kapak yokken çiziliyordu — yani var olan bir fotoğrafı değiştirmenin
 * arayüzde hiçbir yolu yoktu. Fotoğraf yönetimi artık ürünün kendi
 * düzenleme ekranında, her zaman görünür halde.
 *
 * SIRALAMA = VİTRİN. Listenin ilki ürün kartında görünen fotoğraftır; ayrı bir
 * "kapak seç" alanı yerine sıranın kendisi bu anlamı taşıyor (bkz. migration
 * 074 ve ProductsService.syncCoverFromImages).
 */
export default function ProductImagesEditor({ productId, images, pending, onPendingChange, onChanged }: Props) {
  const c = useThemeColors();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seritRef = useDragScroll<HTMLDivElement>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Bekleyen dosyaların önizleme adresleri. Dosya listesi her değiştiğinde
  // yeniden üretilir ve eskiler serbest bırakılır — aksi halde modal her
  // açılıp kapandığında sızıntı birikir.
  const [previews, setPreviews] = useState<string[]>([]);
  // Kırpma penceresinde sıra bekleyen ham dosyalar.
  const [cropQueue, setCropQueue] = useState<File[]>([]);

  useEffect(() => {
    const urls = pending.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [pending]);

  const total = images.length + pending.length;
  const full = total >= MAX_IMAGES;

  // Seçilen ham dosyalar önce kırpma penceresine gider; oradan 4:3 işlenmiş
  // halleriyle geri döner (bkz. ProductPhotoCropModal).
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError("");

    const secilen = Array.from(files).slice(0, MAX_IMAGES - total);
    if (secilen.length === 0) {
      setError(`Bir ürüne en fazla ${MAX_IMAGES} fotoğraf eklenebilir.`);
      return;
    }
    setCropQueue(secilen);
  };

  const handleCropped = async (hazir: File[]) => {
    setCropQueue([]);
    if (hazir.length === 0) return;

    if (!productId) {
      onPendingChange([...pending, ...hazir]);
      return;
    }

    setBusy(true);
    try {
      // Sırayla: aynı ürüne paralel yükleme, sort_order'ı mevcut fotoğraf
      // sayısından türettiği için iki isteğe aynı sırayı verebilirdi.
      let sonuncu: Product | null = null;
      for (const file of hazir) {
        const formData = new FormData();
        formData.append("file", file);
        sonuncu = await api.uploadFile<Product>(`/products/${productId}/images`, formData);
      }
      if (sonuncu) onChanged(sonuncu);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fotoğraf yüklenemedi. Tekrar dene.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (index: number, image?: ProductImage) => {
    setError("");
    if (!image) {
      onPendingChange(pending.filter((_, i) => i !== index - images.length));
      return;
    }
    if (!productId) return;
    setBusy(true);
    try {
      onChanged(await api.delete<Product>(`/products/${productId}/images/${image.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fotoğraf silinemedi.");
    } finally {
      setBusy(false);
    }
  };

  /** Fotoğrafı bir sıra sola/sağa taşır. `hedef` sınırların dışındaysa hiçbir şey yapmaz. */
  const move = async (from: number, to: number) => {
    if (to < 0 || to >= total) return;
    setError("");

    // Kaydedilmemiş üründe her şey yerel listede.
    if (!productId) {
      const next = [...pending];
      const [tasinan] = next.splice(from - images.length, 1);
      next.splice(to - images.length, 0, tasinan);
      onPendingChange(next);
      return;
    }

    // Kaydedilmiş üründe sunucudaki fotoğraflar ile bekleyen dosyalar aynı
    // şeritte görünüyor; taşıma yalnızca sunucu tarafındakiler arasında
    // anlamlı (bekleyenler zaten sona ekleniyor).
    if (from >= images.length || to >= images.length) return;
    const sira = images.map((image) => image.id);
    const [tasinan] = sira.splice(from, 1);
    sira.splice(to, 0, tasinan);

    setBusy(true);
    try {
      onChanged(await api.patch<Product>(`/products/${productId}/images/order`, { imageIds: sira }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sıra değiştirilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const kutular = [
    ...images.map((image) => ({ key: image.id, url: image.url, image })),
    ...pending.map((file, i) => ({ key: `pending-${i}-${file.name}`, url: previews[i] ?? "", image: undefined })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 15, color: c.textSecondary }}>
        Fotoğraflar{total > 0 ? ` (${total}/${MAX_IMAGES})` : ""}
      </label>

      <div ref={seritRef} style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
        {kutular.map((kutu, index) => (
          <div
            key={kutu.key}
            style={{
              position: "relative",
              flexShrink: 0,
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              borderRadius: 8,
              overflow: "hidden",
              // Ürün fotoğrafları beyaz zeminle üretiliyor; çerçeve olmasa
              // açık temada kart zeminiyle birbirine karışırlardı.
              border: `1px solid ${index === 0 ? c.primary : c.border}`,
              background: "#fff",
            }}
          >
            <img src={kutu.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />

            {index === 0 && (
              <span
                style={{
                  position: "absolute",
                  left: 4,
                  top: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "2px 6px",
                  borderRadius: 999,
                  fontSize: 10.5,
                  color: "#fff",
                  background: "rgba(26,31,41,0.72)",
                }}
              >
                <IconStar size={10} color="#fff" filled />
                Vitrin
              </span>
            )}

            <button
              type="button"
              onClick={() => void handleRemove(index, kutu.image)}
              disabled={busy}
              aria-label="Fotoğrafı kaldır"
              title="Fotoğrafı kaldır"
              style={{
                position: "absolute",
                right: 4,
                top: 4,
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: "none",
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "rgba(26,31,41,0.72)",
                cursor: "pointer",
              }}
            >
              <IconTrash size={12} color="#fff" />
            </button>

            <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", justifyContent: "space-between" }}>
              <button
                type="button"
                onClick={() => void move(index, index - 1)}
                disabled={busy || index === 0}
                aria-label="Sola taşı"
                title={index === 1 ? "Vitrine al" : "Sola taşı"}
                style={okStili(index === 0)}
              >
                <IconChevronLeft size={13} color="#fff" />
              </button>
              <button
                type="button"
                onClick={() => void move(index, index + 1)}
                disabled={busy || index === total - 1}
                aria-label="Sağa taşı"
                title="Sağa taşı"
                style={okStili(index === total - 1)}
              >
                <IconChevronRight size={13} color="#fff" />
              </button>
            </div>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            style={{
              flexShrink: 0,
              width: THUMB_WIDTH,
              height: THUMB_HEIGHT,
              borderRadius: 8,
              border: `1px dashed ${c.border}`,
              background: c.surface,
              color: c.textSecondary,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              fontSize: 12.5,
              cursor: busy ? "default" : "pointer",
            }}
          >
            <IconPlus size={16} color={c.textSecondary} />
            {busy ? "Yükleniyor…" : "Fotoğraf ekle"}
          </button>
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12.5, color: c.textSecondary }}>
        {total === 0
          ? "İlk fotoğraf ürün kartında görünür. JPEG, PNG, GIF veya WebP; en fazla 8 MB."
          : "Soldaki fotoğraf ürün kartında görünür — oklarla sırayı değiştirebilirsin."}
      </p>

      {error && <p style={{ margin: 0, color: c.danger, fontSize: 14 }}>{error}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        style={{ display: "none" }}
      />

      {cropQueue.length > 0 && (
        <ProductPhotoCropModal
          files={cropQueue}
          onCancel={() => setCropQueue([])}
          onDone={(hazir) => void handleCropped(hazir)}
        />
      )}
    </div>
  );
}

function okStili(disabled: boolean): React.CSSProperties {
  return {
    width: 24,
    height: 20,
    border: "none",
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(26,31,41,0.55)",
    opacity: disabled ? 0 : 1,
    pointerEvents: disabled ? "none" : "auto",
    cursor: "pointer",
  };
}
