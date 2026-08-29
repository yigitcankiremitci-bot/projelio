"use client";

import { useEffect, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { formatNumber } from "@/lib/site";

/** Görünür alana girince 0'dan hedef değere sayan rakam. */
function Counter({ to, suffix, locale }: { to: number; suffix: string; locale: Locale }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const run = () => {
      if (started.current) return;
      started.current = true;

      const reduce =
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        setValue(to);
        return;
      }

      const duration = 1100;
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        // easeOutExpo — hızlı başlar, sonda yavaşlar
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        setValue(Math.round(to * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") {
      run();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && run()),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [to]);

  return (
    <span ref={ref}>
      {formatNumber(value, locale)}
      {suffix}
    </span>
  );
}

export default function Stats({ dict, locale }: { dict: Dict; locale: Locale }) {
  return (
    <div className="stats-strip">
      {dict.stats.items.map((item) => (
        <div className="stat" key={item.label}>
          <div className="stat-value">
            <Counter to={item.value} suffix={item.suffix} locale={locale} />
          </div>
          <div className="stat-label">{item.label}</div>
        </div>
      ))}
    </div>
  );
}
