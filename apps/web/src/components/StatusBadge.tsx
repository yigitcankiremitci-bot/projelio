import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ProjectStatus } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { IconCheck, IconChevronRight } from "./icons";
// Etiketler, sıra ve renkler React'ten bağımsız bir dosyada: kontrastları test
// edilebilsin diye (bkz. lib/projectStatus.test.ts).
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLE } from "../lib/projectStatus";

interface Props {
  status: ProjectStatus;
  /**
   * Verilirse rozet tıklanabilir olur ve durumu değiştiren küçük bir menü açar.
   * Verilmezse (yetkisi olmayan kullanıcı) eskisi gibi salt okunur bir etikettir.
   */
  onChange?: (status: ProjectStatus) => void;
}

/** Menünün ekran kenarına bırakacağı en küçük boşluk. */
const VIEWPORT_MARGIN = 8;

const badgeStyle = (s: { bg: string; text: string }) => ({
  fontSize: 13,
  fontWeight: 500,
  padding: "3px 9px",
  borderRadius: 20,
  background: s.bg,
  color: s.text,
  whiteSpace: "nowrap" as const,
});

export default function StatusBadge({ status, onChange }: Props) {
  const c = useThemeColors();
  const s = PROJECT_STATUS_STYLE[status];
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  /**
   * Menü konumu.
   *
   * Neden `position: absolute` değil: rozet proje kartının içinde yaşıyor, kart
   * ise köşeleri yuvarlansın diye `overflow: hidden`. Kart içinde açılan menü
   * hem kırpılıyor hem de dar ekranda kartın sağından taşıp ekranın dışına
   * çıkıyordu. Menü artık gövdeye portal ile basılıyor ve konumu görünür alana
   * kenetleniyor: sağa taşarsa sola çekilir, aşağıda yer yoksa yukarı açılır.
   */
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!anchor || !menu) return;
      const left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(anchor.left, window.innerWidth - menu.width - VIEWPORT_MARGIN)
      );
      const below = anchor.bottom + 6;
      const top =
        below + menu.height > window.innerHeight - VIEWPORT_MARGIN
          ? Math.max(VIEWPORT_MARGIN, anchor.top - 6 - menu.height)
          : below;
      setPosition({ top, left });
    };
    place();
    // Sayfa kayarsa menü rozetin altında kalmaya devam etmeli: `fixed` olduğu
    // için yerinde donup rozetten kopardı.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Menü portalda, yani rozetin DOM alt ağacında değil — ikisi de sorulmalı.
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!onChange) {
    return <span style={badgeStyle(s)}>{PROJECT_STATUS_LABELS[status]}</span>;
  }

  // Rozet kart içindeyken bir <Link>'in içinde yaşıyor (bkz. ProjectCard):
  // tıklama engellenmezse menüyü açmak yerine projeye giriyor. Portal, React
  // ağacında hâlâ burada olduğu için menüdeki tıklamalar da aynı yolu izler.
  const swallow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div ref={anchorRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={(e) => {
          swallow(e);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Durumu değiştir"
        style={{
          ...badgeStyle(s),
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          border: "none",
          paddingRight: 6,
          font: "inherit",
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {PROJECT_STATUS_LABELS[status]}
        <span style={{ display: "inline-flex", transform: "rotate(90deg)" }}>
          <IconChevronRight size={11} color={s.text} />
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              // İlk render ölçüm içindir; konum hesaplanana kadar görünmez durur,
              // yoksa menü bir kare boyunca sol üst köşede çakıyordu.
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? "visible" : "hidden",
              minWidth: 180,
              maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 10,
              padding: 4,
              boxShadow: "0 4px 16px rgba(26,31,41,0.18)",
              zIndex: 60,
            }}
          >
            {PROJECT_STATUSES.map((value) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={status === value}
                onClick={(e) => {
                  swallow(e);
                  setOpen(false);
                  if (value !== status) onChange(value);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "10px 11px",
                  fontSize: 15,
                  textAlign: "left",
                  border: "none",
                  borderRadius: 7,
                  background: "transparent",
                  color: c.textPrimary,
                }}
              >
                <span style={{ width: 14, display: "flex", flexShrink: 0 }}>
                  {status === value && <IconCheck size={14} color={c.primary} />}
                </span>
                {PROJECT_STATUS_LABELS[value]}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
