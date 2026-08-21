/**
 * Turun görünen yüzü: hedef öğeyi karartmanın içinde bir "spot ışığı" ile
 * öne çıkarır, yanında da metni ve ses kontrollerini taşıyan baloncuğu gösterir.
 *
 * Hedef öğe DOM'da `[data-tour="..."]` ile bulunur. Bulunamazsa:
 *  - adım `optional` ise sessizce atlanır (bkz. TourContext.reportAnchorMissing),
 *  - değilse baloncuk ekranın ortasında hedefsiz gösterilir.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useThemeColors } from "../../theme/useThemeColors";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { useTour } from "../../lib/tour/TourContext";
import type { TourPlacement } from "../../lib/tour/types";
import { IconX, IconChevronLeft, IconChevronRight, IconCheck } from "../icons";

const OVERLAY_Z = 300;
const GAP = 14;
const BUBBLE_WIDTH = 360;
const SPOT_PADDING = 8;
/** Hedef öğe kaç ölçümde bulunamazsa "yok" sayılır (250 ms x 6 ≈ 1.5 sn). */
const MAX_MISSES = 6;
const RATES = [0.85, 1, 1.15, 1.35];

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readRect(anchor: string | undefined): Box | null {
  if (!anchor) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(anchor)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function placeBubble(
  box: Box | null,
  placement: TourPlacement,
  size: { w: number; h: number },
  vw: number,
  vh: number
): { top: number; left: number } {
  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
  if (!box || placement === "center") {
    return { top: clamp((vh - size.h) / 2, GAP, vh - size.h - GAP), left: clamp((vw - size.w) / 2, GAP, vw - size.w - GAP) };
  }

  const spaceBottom = vh - (box.top + box.height);
  const spaceTop = box.top;
  const spaceRight = vw - (box.left + box.width);
  const spaceLeft = box.left;

  let resolved: TourPlacement = placement;
  if (placement === "auto") {
    if (spaceBottom >= size.h + GAP * 2) resolved = "bottom";
    else if (spaceTop >= size.h + GAP * 2) resolved = "top";
    else if (spaceRight >= size.w + GAP * 2) resolved = "right";
    else if (spaceLeft >= size.w + GAP * 2) resolved = "left";
    else resolved = "bottom";
  } else {
    // İstenen yön sığmıyorsa karşı tarafa çevrilir.
    if (resolved === "bottom" && spaceBottom < size.h + GAP && spaceTop > spaceBottom) resolved = "top";
    else if (resolved === "top" && spaceTop < size.h + GAP && spaceBottom > spaceTop) resolved = "bottom";
    else if (resolved === "right" && spaceRight < size.w + GAP && spaceLeft > spaceRight) resolved = "left";
    else if (resolved === "left" && spaceLeft < size.w + GAP && spaceRight > spaceLeft) resolved = "right";
  }

  let top: number;
  let left: number;
  switch (resolved) {
    case "top":
      top = box.top - size.h - GAP;
      left = box.left + box.width / 2 - size.w / 2;
      break;
    case "left":
      top = box.top + box.height / 2 - size.h / 2;
      left = box.left - size.w - GAP;
      break;
    case "right":
      top = box.top + box.height / 2 - size.h / 2;
      left = box.left + box.width + GAP;
      break;
    case "bottom":
    default:
      top = box.top + box.height + GAP;
      left = box.left + box.width / 2 - size.w / 2;
      break;
  }

  return {
    top: clamp(top, GAP, Math.max(GAP, vh - size.h - GAP)),
    left: clamp(left, GAP, Math.max(GAP, vw - size.w - GAP)),
  };
}

export default function TourOverlay() {
  const c = useThemeColors();
  const isDesktop = useIsDesktop();
  const {
    tour,
    step,
    stepIndex,
    stepCount,
    speaking,
    source,
    voiceEnabled,
    rate,
    autoAdvance,
    next,
    prev,
    goTo,
    stop,
    togglePlay,
    setVoiceEnabled,
    setRate,
    setAutoAdvance,
    reportAnchorMissing,
  } = useTour();

  const [box, setBox] = useState<Box | null>(null);
  const [size, setSize] = useState({ w: BUBBLE_WIDTH, h: 240 });
  const bubbleRef = useRef<HTMLDivElement>(null);
  const missesRef = useRef(0);

  const anchor = step?.anchor;
  const isLast = stepIndex >= stepCount - 1;

  // Adım değişince hedefi görünür alana getir.
  useEffect(() => {
    if (!anchor) {
      setBox(null);
      return;
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${CSS.escape(anchor)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [anchor, stepIndex, tour?.id]);

  // Hedefin konumu; sayfa kaydırıldıkça/yeniden boyutlandıkça güncellenir.
  // Sabit aralıklı ölçüm, açılıp kapanan paneller ve animasyonlu geçişlerde
  // scroll/resize olaylarından daha güvenilir.
  useEffect(() => {
    missesRef.current = 0;
    if (!tour || !step) return;
    const measure = () => {
      const r = readRect(anchor);
      setBox(r);
      if (anchor && !r) {
        missesRef.current += 1;
        if (missesRef.current === MAX_MISSES) reportAnchorMissing(stepIndex);
      } else {
        missesRef.current = 0;
      }
    };
    measure();
    const timer = window.setInterval(measure, 250);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", measure, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", measure);
    };
  }, [anchor, stepIndex, tour, step, reportAnchorMissing]);

  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
  }, [stepIndex, tour?.id, isDesktop]);

  if (!tour || !step) return null;

  const pad = step.padding ?? SPOT_PADDING;
  const spot = box
    ? { top: box.top - pad, left: box.left - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
    : null;

  const pos = isDesktop
    ? placeBubble(spot, step.placement ?? "auto", size, window.innerWidth, window.innerHeight)
    : null;

  const bubbleStyle: CSSProperties = isDesktop
    ? {
        position: "fixed",
        top: pos!.top,
        left: pos!.left,
        width: BUBBLE_WIDTH,
        maxWidth: "calc(100vw - 28px)",
      }
    : {
        // Dar ekranda baloncuk her zaman alttan açılan bir kart olur: küçük
        // ekranda hedefin yanına sığdırmaya çalışmak metni okunmaz hale getiriyor.
        position: "fixed",
        left: 10,
        right: 10,
        bottom: 10,
      };

  const controlBtn: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    cursor: "pointer",
  };

  return (
    <>
      {/* Karartma. Hedef varsa dev bir box-shadow ile "delik" bırakılır; bu
          sayede tek bir öğeyle hem karartma hem spot ışığı elde edilir. */}
      {spot ? (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: spot.top,
            left: spot.left,
            width: spot.width,
            height: spot.height,
            borderRadius: 12,
            boxShadow: `0 0 0 9999px rgba(15,18,25,0.60)`,
            outline: `2px solid ${c.accent}`,
            outlineOffset: 2,
            zIndex: OVERLAY_Z,
            pointerEvents: "none",
            transition: "top 0.22s ease, left 0.22s ease, width 0.22s ease, height 0.22s ease",
          }}
        />
      ) : (
        <div
          aria-hidden
          onClick={() => stop()}
          style={{ position: "fixed", inset: 0, background: "rgba(15,18,25,0.60)", zIndex: OVERLAY_Z }}
        />
      )}

      <div
        ref={bubbleRef}
        role="dialog"
        aria-live="polite"
        aria-label={`${tour.title} — adım ${stepIndex + 1} / ${stepCount}`}
        style={{
          ...bubbleStyle,
          zIndex: OVERLAY_Z + 1,
          background: c.surface,
          borderRadius: 14,
          border: `1px solid ${c.border}`,
          boxShadow: "0 12px 40px rgba(15,18,25,0.28)",
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <img src="/lio-base.png" alt="" aria-hidden style={{ width: 30, height: 30, objectFit: "contain" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {tour.title} · {stepIndex + 1}/{stepCount}
            </div>
          </div>
          <button
            type="button"
            onClick={() => stop()}
            aria-label="Turu kapat"
            title="Turu kapat (Esc)"
            style={{ border: "none", background: "transparent", cursor: "pointer", padding: 4, lineHeight: 0 }}
          >
            <IconX size={16} color={c.textSecondary} />
          </button>
        </div>

        <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 600, color: c.textPrimary }}>{step.title}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: c.textSecondary }}>{step.text}</p>

        {/* İlerleme noktaları: tıklanabilir, istenen adıma atlar. */}
        <div style={{ display: "flex", gap: 6, margin: "14px 0 12px", flexWrap: "wrap" }}>
          {tour.steps.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`${i + 1}. adım: ${s.title}`}
              title={s.title}
              style={{
                width: i === stepIndex ? 22 : 8,
                height: 8,
                padding: 0,
                borderRadius: 4,
                border: "none",
                cursor: "pointer",
                background: i === stepIndex ? c.accent : i < stepIndex ? c.accentDark : c.border,
                opacity: i < stepIndex ? 0.5 : 1,
                transition: "width 0.2s ease",
              }}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            style={{ ...controlBtn, width: 38, padding: 0 }}
            aria-label={voiceEnabled ? "Sesi kapat" : "Sesi aç"}
            title={voiceEnabled ? "Sesi kapat" : "Sesi aç"}
          >
            <span aria-hidden style={{ fontSize: 15 }}>{voiceEnabled ? "🔊" : "🔇"}</span>
          </button>

          {voiceEnabled && (
            <button
              type="button"
              onClick={togglePlay}
              style={{ ...controlBtn, width: 38, padding: 0 }}
              aria-label={speaking ? "Duraklat" : "Devam et"}
              title={speaking ? "Duraklat" : "Devam et"}
            >
              <span aria-hidden style={{ fontSize: 13 }}>{speaking ? "❚❚" : "▶"}</span>
            </button>
          )}

          {voiceEnabled && (
            <button
              type="button"
              onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}
              style={{ ...controlBtn, padding: "0 8px" }}
              title="Anlatım hızı"
            >
              {rate}x
            </button>
          )}

          <div style={{ flex: 1 }} />

          <button type="button" onClick={prev} disabled={stepIndex === 0} style={{ ...controlBtn, opacity: stepIndex === 0 ? 0.45 : 1 }}>
            <IconChevronLeft size={14} color={c.textSecondary} />
            Geri
          </button>

          <button
            type="button"
            onClick={isLast ? () => stop({ completed: true }) : next}
            style={{
              ...controlBtn,
              background: c.accent,
              border: `1px solid ${c.accent}`,
              color: "#fff",
              fontWeight: 500,
            }}
          >
            {isLast ? "Bitir" : "İleri"}
            {isLast ? <IconCheck size={14} color="#fff" /> : <IconChevronRight size={14} color="#fff" />}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: c.textSecondary, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoAdvance}
              onChange={(e) => setAutoAdvance(e.target.checked)}
              style={{ width: 15, height: 15, margin: 0 }}
            />
            Anlatım bitince kendiliğinden ilerle
          </label>
          {voiceEnabled && source === "tts" && (
            <span style={{ fontSize: 12, color: c.textSecondary }} title="Bu adımın kaydı henüz yüklenmedi; metin cihazın sesiyle okunuyor.">
              demo ses
            </span>
          )}
        </div>
      </div>
    </>
  );
}
