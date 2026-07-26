import { useEffect } from "react";
import type { ReactNode } from "react";
import { colors } from "../theme/colors";
import { IconX } from "./icons";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
}

export default function Modal({ title, onClose, children, maxWidth = 400 }: Props) {
  const c = colors.light;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26,31,41,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth,
          maxHeight: "85vh",
          overflowY: "auto",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          padding: "20px 22px 22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: c.textPrimary, margin: 0 }}>{title}</h2>
          <button
            onClick={onClose}
            aria-label="Kapat"
            style={{ background: "transparent", border: "none", padding: 4, display: "flex" }}
          >
            <IconX size={18} color={c.textSecondary} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
