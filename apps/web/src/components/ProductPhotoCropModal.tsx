import { useEffect, useRef, useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { PRODUCT_ASPECT, resizeProductImage } from "../lib/imageProcessing";
import type { ProductCropArea } from "../lib/imageProcessing";
import { useT } from "../lib/i18n";

const FRAME_W = 384;
const FRAME_H = Math.round(FRAME_W / PRODUCT_ASPECT); // 288 — çıktıyla aynı oran
/** Taban ölçeğin (çerçeveyi dolduran ölçek) kaç katına kadar yakınlaştırılabilir. */
const MAX_ZOOM = 3;

interface Props {
  /** Kullanıcının seçtiği ham dosyalar. Sırayla, tek tek kırpılır. */
  files: File[];
  onCancel: () => void;
  /** İşlenmiş (4:3, sıkıştırılmış) dosyalar — seçilen sırayla. */
  onDone: (processed: File[]) => void;
}

/**
 * Ürün fotoğrafını çerçeveye yerleştirme: sürükle + yakınlaştır.
 *
 * NEDEN GEREKLİ. Fotoğraf 4:3'e "contain" ile sığdırılıyordu, yani dikey bir
 * ürün fotoğrafı ortaya oturup iki yanında beyaz bant bırakıyordu. Kırpmamak
 * bilinçli bir karardı (ürünün kenarı kesilmesin) ama sonuç kabul edilmedi.
 *
 * BEYAZ BANT ÜRETİLEMEZ. Yakınlaştırmanın TABANI, çerçeveyi tamamen dolduran
 * ölçek (`fillScale`) — daha aza inilemiyor. Yani kullanıcının seçebileceği
 * her kırpma görselin içinde kalıyor ve çıktıda hiç boşluk olmuyor. Kullanıcıya
 * kalan karar "ürünün hangi kısmı görünsün", "boşluk olsun mu" değil.
 *
 * ORAN TEK YERDEN. Çerçeve PRODUCT_ASPECT'ten türetiliyor; kırpma alanının
 * oranı çıktının oranıyla aynı olmak zorunda, yoksa görüntü ezilir.
 */
export default function ProductPhotoCropModal({ files, onCancel, onDone }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [processed, setProcessed] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const file = files[index];

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // zoom = 1 → çerçeve TAM DOLU (cover). Math.max, Math.min değil: küçük olan
  // ölçek fotoğrafı sığdırır ama kenarda boşluk bırakır, büyük olan doldurur.
  // Avatar kırpıcısındaki mantığın aynısı — orada da çerçeve hiç boş kalmıyor.
  const fillScale = natural ? Math.max(FRAME_W / natural.w, FRAME_H / natural.h) : 1;
  const scale = fillScale * zoom;
  const displayW = natural ? natural.w * scale : 0;
  const displayH = natural ? natural.h * scale : 0;

  // Taban ölçekte bir eksen çerçeveye tam oturur; o eksende kaydırma yok (sınır 0).
  const maxOffsetX = Math.max(0, (displayW - FRAME_W) / 2);
  const maxOffsetY = Math.max(0, (displayH - FRAME_H) / 2);
  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

  // Yakınlaştırma küçüldüğünde eski kaydırma sınırların dışında kalabilir.
  useEffect(() => {
    setOffset((o) => {
      const x = clamp(o.x, maxOffsetX);
      const y = clamp(o.y, maxOffsetY);
      return x === o.x && y === o.y ? o : { x, y };
    });
  }, [maxOffsetX, maxOffsetY]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!natural) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffset({
      x: clamp(drag.originX + (e.clientX - drag.startX), maxOffsetX),
      y: clamp(drag.originY + (e.clientY - drag.startY), maxOffsetY),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  /** Ekrandaki çerçeveyi kaynak görselin piksel koordinatlarına çevirir. */
  const currentCrop = (): ProductCropArea | undefined => {
    if (!natural) return undefined;
    return {
      x: ((displayW - FRAME_W) / 2 - offset.x) / scale,
      y: ((displayH - FRAME_H) / 2 - offset.y) / scale,
      width: FRAME_W / scale,
      height: FRAME_H / scale,
    };
  };

  const handleNext = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const hazir = await resizeProductImage(file, currentCrop());
      const yeni = [...processed, hazir];
      if (index + 1 < files.length) {
        setProcessed(yeni);
        setIndex(index + 1);
      } else {
        onDone(yeni);
      }
    } finally {
      setBusy(false);
    }
  };

  const sonuncu = index + 1 >= files.length;

  return (
    <Modal
      title={files.length > 1 ? `Fotoğrafı yerleştir (${index + 1}/${files.length})` : "Fotoğrafı yerleştir"}
      onClose={onCancel}
      maxWidth={460}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: FRAME_W,
            aspectRatio: `${PRODUCT_ASPECT}`,
            overflow: "hidden",
            borderRadius: 10,
            // Çerçeve zemini beyaz: kırpılmayan kenarlarda kartta ne
            // görüneceğinin birebir önizlemesi.
            background: "#fff",
            border: `1px solid ${c.border}`,
            cursor: maxOffsetX || maxOffsetY ? "grab" : "default",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {imgSrc && natural && (
            <img
              src={imgSrc}
              alt={t("Kırpma önizlemesi")}
              draggable={false}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                width: displayW,
                height: displayH,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <input
          type="range"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t("Yakınlaştırma")}
          style={{ width: "100%", maxWidth: FRAME_W, height: "auto", padding: 0, border: "none", background: "none" }}
        />

        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, textAlign: "center" }}>
          {maxOffsetX || maxOffsetY
            ? "Fotoğrafı sürükleyerek konumlandır, aşağıdan yakınlaştır."
            : "Aşağıdan yakınlaştırıp fotoğrafı sürükleyebilirsin."}
        </p>

        <div style={{ display: "flex", gap: 10, width: "100%", maxWidth: FRAME_W }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            {t("Vazgeç")}
          </button>
          <button
            type="button"
            onClick={() => void handleNext()}
            disabled={!natural || busy}
            style={{
              flex: 2,
              padding: "11px 0",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 16,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {busy ? "İşleniyor…" : sonuncu ? "Ekle" : "Sonraki"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
