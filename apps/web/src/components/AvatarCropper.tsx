import { useEffect, useRef, useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";
import type { CropArea } from "../lib/imageProcessing";
import { useT } from "../lib/i18n";

interface Props {
  file: File;
  // Kullanıcı fotoğrafı sürükleyip yakınlaştırdıkça seçili kare alanı yukarı bildirir.
  onChange: (crop: CropArea) => void;
}

const FRAME = 220;
const MAX_ZOOM = 3;

// Yuvarlak çerçeveli kırpma alanı: fotoğraf sürüklenerek konumlandırılır, slider ile
// yakınlaştırılır. Çerçeve sabit (FRAME px), fotoğraf onun altında hareket eder.
// Seçilen alan kaynak görselin piksel koordinatlarına çevrilip onChange ile bildirilir.
export default function AvatarCropper({ file, onChange }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Görselin çerçeveyi tam kaplayacak şekilde ölçeklenmiş (zoom=1) ekran boyutu.
  const baseScale = natural ? Math.max(FRAME / natural.w, FRAME / natural.h) : 1;
  const displayW = natural ? natural.w * baseScale * zoom : 0;
  const displayH = natural ? natural.h * baseScale * zoom : 0;

  // Çerçevede boşluk kalmaması için kaydırma sınırları.
  const maxOffsetX = Math.max(0, (displayW - FRAME) / 2);
  const maxOffsetY = Math.max(0, (displayH - FRAME) / 2);

  const clamp = (value: number, limit: number) => Math.min(limit, Math.max(-limit, value));

  useEffect(() => {
    if (!natural) return;
    const x = clamp(offset.x, maxOffsetX);
    const y = clamp(offset.y, maxOffsetY);
    if (x !== offset.x || y !== offset.y) {
      setOffset({ x, y });
      return;
    }
    // Ekran koordinatlarını kaynak görselin piksel koordinatlarına çevir.
    const scale = baseScale * zoom;
    const cropSize = FRAME / scale;
    const cropX = (displayW - FRAME) / 2 / scale - x / scale;
    const cropY = (displayH - FRAME) / 2 / scale - y / scale;
    onChange({
      x: Math.max(0, Math.min(cropX, natural.w - cropSize)),
      y: Math.max(0, Math.min(cropY, natural.h - cropSize)),
      size: cropSize,
    });
    // onChange her render'da yeni referans olabileceğinden bağımlılığa dahil edilmiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [natural, zoom, offset.x, offset.y, baseScale, displayW, displayH, maxOffsetX, maxOffsetY]);

  const onPointerDown = (e: React.PointerEvent) => {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: "relative",
          width: FRAME,
          height: FRAME,
          borderRadius: "50%",
          overflow: "hidden",
          background: c.background,
          border: `2px solid ${c.border}`,
          cursor: "grab",
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

      <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, textAlign: "center" }}>
        {t("Fotoğrafı sürükleyerek konumlandır, aşağıdan yakınlaştır.")}
      </p>

      <input
        type="range"
        min={1}
        max={MAX_ZOOM}
        step={0.01}
        value={zoom}
        onChange={(e) => setZoom(Number(e.target.value))}
        aria-label={t("Yakınlaştırma")}
        style={{ width: "100%", maxWidth: FRAME }}
      />
    </div>
  );
}
