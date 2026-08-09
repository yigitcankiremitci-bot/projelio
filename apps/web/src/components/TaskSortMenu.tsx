import { useEffect, useRef, useState } from "react";
import { colors } from "../theme/colors";
import { TASK_SORTS, type TaskSortMode } from "../lib/taskSort";
import { IconCheck, IconSortDescending } from "./icons";

interface Props {
  value: TaskSortMode;
  onChange: (value: TaskSortMode) => void;
}

/**
 * Görev listelerinin sıralama seçicisi. Görev kartının göründüğü her panoda
 * aynı düğme, aynı seçenekler, aynı davranış.
 *
 * Varsayılan ("Kendi sıram") dışında bir ölçüt seçiliyken düğme işaretli görünür
 * ve ölçütün adını yazar — aksi halde kullanıcı listeyi beklenmedik sırada bulup
 * bir şeyin bozulduğunu sanıyor.
 */
export default function TaskSortMenu({ value, onChange }: Props) {
  const c = colors.light;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = TASK_SORTS.find((s) => s.value === value)!;
  const isDefault = value === "manual";

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
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

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Sıralama ölçütü"
        title={`Sıralama: ${active.label}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "8px 14px",
          fontSize: 15,
          borderRadius: 8,
          border: `1px solid ${isDefault ? c.border : c.primary}`,
          background: isDefault ? c.surface : `${c.primary}12`,
          color: isDefault ? c.textSecondary : c.textPrimary,
          whiteSpace: "nowrap",
        }}
      >
        <IconSortDescending size={17} color={isDefault ? c.textSecondary : c.primary} />
        {!isDefault && active.label}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 210,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            padding: 4,
            boxShadow: "0 4px 16px rgba(26,31,41,0.18)",
            zIndex: 50,
          }}
        >
          {TASK_SORTS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="menuitemradio"
              aria-checked={value === s.value}
              onClick={() => {
                onChange(s.value);
                setOpen(false);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "10px 12px",
                fontSize: 15,
                textAlign: "left",
                border: "none",
                borderRadius: 7,
                background: "transparent",
                color: c.textPrimary,
              }}
            >
              <span style={{ width: 14, display: "flex", flexShrink: 0 }}>
                {value === s.value && <IconCheck size={14} color={c.primary} />}
              </span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
