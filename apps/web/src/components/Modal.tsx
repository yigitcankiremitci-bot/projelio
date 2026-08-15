import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { colors } from "../theme/colors";
import { IconX } from "./icons";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  /** Başlığın altındaki tek satırlık açıklama (modül modallerinde katalog metni). */
  subtitle?: string;
  /**
   * Dar ekranda kenar boşluksuz, tam ekran açılsın mı.
   *
   * Modül modalleri için gerekli: telefonda 20px boşlukla ortalanmış bir kutuya
   * form ya da liste sığmıyor, içerik iki kelimede bir kırılıyor.
   */
  mobileFullScreen?: boolean;
}

export default function Modal({
  title,
  onClose,
  children,
  maxWidth = 400,
  subtitle,
  mobileFullScreen = false,
}: Props) {
  const c = colors.light;
  const fullScreen = mobileFullScreen && typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Modal her zaman body'ye taşınır (portal). Aksi halde CSS "transform" ya da
  // "will-change" uygulanmış bir üst öğenin içinde kalırsa (örn. hover'da büyüyen
  // kişi kartı) o öğe position:fixed için içeren blok haline gelir; modal ekranın
  // ortası yerine o kartın üstünde açılır ve karartma sadece kartı kaplar.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,31,41,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: fullScreen ? 0 : 20,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: fullScreen ? "none" : maxWidth,
          maxHeight: fullScreen ? "none" : "85vh",
          height: fullScreen ? "100%" : undefined,
          overflowY: "auto",
          background: c.surface,
          border: fullScreen ? "none" : `1px solid ${c.border}`,
          borderRadius: fullScreen ? 0 : 14,
          padding: "20px 22px 22px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{title}</h2>
            {subtitle && (
              <p style={{ margin: "4px 0 0", fontSize: 13, color: c.textSecondary, lineHeight: 1.4 }}>{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{ background: "transparent", border: "none", padding: 4, display: "flex", flexShrink: 0 }}
          >
            <IconX size={18} color={c.textSecondary} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
