import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useThemeColors } from "../theme/useThemeColors";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  /** Yıkıcı eylem (kaldır): tehlike rengiyle ve ayırıcıdan sonra çizilir. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Sağ tık menüsü — dosya ve klasörler için.
 *
 * Konum İMLECİN yerinden geliyor, tıklanan öğeden değil: Drive'da da böyle ve
 * kullanıcı menüyü açtığı noktada bekliyor. Ekran dışına taşmamak için ölçüm
 * sonrası konum düzeltiliyor (useLayoutEffect: boyanmadan önce, menü bir kare
 * yanlış yerde görünmesin).
 */
export default function FileContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}) {
  const c = useThemeColors();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // 8px pay: menü kenara yapışık durmasın.
    setPos({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  useEffect(() => {
    // Dışarı tıklama, Esc ve kaydırma menüyü kapatır. Kaydırma da kapatmalı:
    // menü sabit konumlu, sayfa kayınca ilgisiz bir öğenin üstünde kalıyordu.
    const kapat = () => onClose();
    const tus = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("click", kapat);
    window.addEventListener("contextmenu", kapat);
    window.addEventListener("scroll", kapat, true);
    window.addEventListener("keydown", tus);
    return () => {
      window.removeEventListener("click", kapat);
      window.removeEventListener("contextmenu", kapat);
      window.removeEventListener("scroll", kapat, true);
      window.removeEventListener("keydown", tus);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 1000,
        minWidth: 190,
        padding: "6px 0",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        background: c.surface,
        boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={`${item.label}-${i}`}
          type="button"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            onClose();
            item.onClick();
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "9px 14px",
            border: "none",
            background: "transparent",
            color: item.disabled ? c.textSecondary : item.danger ? c.danger : c.textPrimary,
            fontSize: 15,
            cursor: item.disabled ? "not-allowed" : "pointer",
            opacity: item.disabled ? 0.6 : 1,
            borderTop: item.danger ? `1px solid ${c.border}` : undefined,
            marginTop: item.danger ? 4 : undefined,
            paddingTop: item.danger ? 10 : undefined,
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
