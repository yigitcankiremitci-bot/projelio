"use client";

import { useEffect, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import MockScreen from "./MockScreens";

const KINDS = ["dashboard", "kanban", "chat"];

/**
 * Kaydırdıkça ilerleyen kurulum adımları.
 * Solda yapışkan ekran, sağda adımlar; görünen adıma göre ekran değişir.
 * Mobilde yapışkanlık devre dışı kalır, normal liste gibi akar.
 */
export default function HowSteps({ dict, locale }: { dict: Dict; locale: Locale }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    const items = refs.current.filter(Boolean) as HTMLLIElement[];
    if (!items.length || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const i = items.indexOf(e.target as HTMLLIElement);
            if (i >= 0) setActive(i);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="how-scroll">
      <div className="how-sticky">
        <div className="shot" style={{ boxShadow: "var(--shadow-lg)" }}>
          <div className="shot-frame">
            <i />
            <i />
            <i />
            <span>projelio.app</span>
          </div>
          <div className="shot-body" key={active} style={{ animation: "fade-swap .5s ease both" }}>
            <MockScreen kind={KINDS[active] ?? "dashboard"} locale={locale} />
          </div>
        </div>
        <div className="how-progress" aria-hidden="true">
          {dict.how.steps.map((s, i) => (
            <span key={s.title} data-on={i <= active} />
          ))}
        </div>
      </div>

      <ol className="how-list">
        {dict.how.steps.map((step, i) => (
          <li
            key={step.title}
            className="how-item"
            data-active={i === active}
            ref={(el) => {
              refs.current[i] = el;
            }}
          >
            <span className="how-num">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="h3">{step.title}</h3>
            <p className="muted">{step.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
