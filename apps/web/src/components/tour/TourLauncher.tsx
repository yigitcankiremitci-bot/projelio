/**
 * Her sayfada sağ üstte duran "?" düğmesi: bulunduğun sayfayla ilgili sesli
 * anlatımları listeler, istediğini baştan başlatır.
 *
 * Turun kendisi istenildiği an başlatılabilsin diye buradaki liste iki bölümdür:
 * önce bu sayfaya ait olanlar, sonra uygulamadaki diğer bütün anlatımlar.
 */

import { useEffect, useRef, useState } from "react";
import { colors } from "../../theme/colors";
import { useTour } from "../../lib/tour/TourContext";
import { AREA_LABELS, tourAnchor } from "../../lib/tour/types";
import { IconCheck, IconX } from "../icons";

export default function TourLauncher() {
  const c = colors.light;
  const { toursHere, allTours, seen, start, tour, voiceEnabled, setVoiceEnabled } = useTour();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Tur başlarken liste kapanmalı, aksi halde spot ışığının önünde duruyor.
  useEffect(() => {
    if (tour) setOpen(false);
  }, [tour]);

  const others = allTours.filter((t) => !toursHere.some((x) => x.id === t.id));

  const renderRow = (id: string, title: string, description: string, area: string) => (
    <button
      key={id}
      type="button"
      onClick={() => {
        setOpen(false);
        start(id);
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        border: "none",
        borderRadius: 10,
        background: "transparent",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{
          marginTop: 2,
          width: 22,
          height: 22,
          borderRadius: 6,
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: seen.includes(id) ? "transparent" : c.accent,
          border: seen.includes(id) ? `1px solid ${c.border}` : "none",
        }}
      >
        {seen.includes(id) ? <IconCheck size={12} color={c.textSecondary} /> : <span style={{ color: "#fff", fontSize: 12 }}>▶</span>}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: c.textPrimary }}>{title}</span>
        <span style={{ display: "block", fontSize: 12.5, color: c.textSecondary, marginTop: 2 }}>{description}</span>
        <span style={{ display: "block", fontSize: 11, color: c.textSecondary, marginTop: 3, opacity: 0.8 }}>{area}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} style={{ position: "fixed", top: 14, right: 62, zIndex: 40 }}>
      <button
        type="button"
        {...tourAnchor("tour-launcher")}
        onClick={() => setOpen((v) => !v)}
        aria-label="Sesli kullanım anlatımı"
        title="Sesli kullanım anlatımı"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: c.surface,
          border: `1px solid ${c.border}`,
          boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
          cursor: "pointer",
          color: c.textSecondary,
          fontSize: 18,
          fontWeight: 600,
          padding: 0,
        }}
      >
        ?
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: 48,
            right: 0,
            width: 330,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: "70vh",
            overflowY: "auto",
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 14,
            boxShadow: "0 12px 32px rgba(15,18,25,0.18)",
            padding: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 8px" }}>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>Sesli anlatım</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Kapat"
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, lineHeight: 0 }}
            >
              <IconX size={15} color={c.textSecondary} />
            </button>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              margin: "0 2px 6px",
              borderRadius: 10,
              background: c.background,
              fontSize: 13,
              color: c.textSecondary,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={voiceEnabled}
              onChange={(e) => setVoiceEnabled(e.target.checked)}
              style={{ width: 15, height: 15, margin: 0 }}
            />
            Anlatımı sesli dinle
          </label>

          {toursHere.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary, padding: "6px 10px 4px" }}>
                Bu sayfa
              </div>
              {toursHere.map((t) => renderRow(t.id, t.title, t.description, AREA_LABELS[t.area]))}
            </>
          )}

          {others.length > 0 && (
            <>
              <div style={{ fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase", color: c.textSecondary, padding: "10px 10px 4px" }}>
                Diğer anlatımlar
              </div>
              {others.map((t) => renderRow(t.id, t.title, t.description, AREA_LABELS[t.area]))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
