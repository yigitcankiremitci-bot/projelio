"use client";

import { useRef, useState } from "react";
import type { Dict } from "@/i18n";
import { useScrollFilm } from "@/lib/useScrollFilm";
import { featureIcons } from "./Icons";

/**
 * Aşağı kaydırdıkça yana akan özellikler şeridi (yapışma mantığı
 * useScrollFilm'de). Dar ekranda parmakla kaydırılan yatay listeye döner.
 */
export default function FeatureFilm({ dict }: { dict: Dict }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);
  const items = dict.features.items;

  const pinned = useScrollFilm(sectionRef, trackRef, (progress) => {
    if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;

    // Etkin kart = merkezi ekranın ortasına en yakın olan. İlerlemeden
    // doğrusal hesaplanınca vurgu ekranın kenarındaki karta kayıyordu.
    const mid = window.innerWidth / 2;
    let best = 0;
    let bestGap = Infinity;
    trackRef.current?.querySelectorAll<HTMLElement>(".film-card").forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const gap = Math.abs(r.left + r.width / 2 - mid);
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    });
    // Son kart şeridin sağ kenarında durur, ortaya hiç gelmez; sayaç
    // "08 / 08"e ulaşsın diye sona varınca onu seç.
    setActive(progress > 0.97 ? items.length - 1 : best);
  });

  const total = String(items.length).padStart(2, "0");

  return (
    <section className="film" id="features" ref={sectionRef}>
      <div className="film-sticky">
        <div className="film-head wrap">
          <div>
            <span className="eyebrow">{dict.features.eyebrow}</span>
            <h2 className="h2">{dict.features.title}</h2>
          </div>
          <div className="film-meter" aria-hidden="true">
            <span className="film-progress">
              <span ref={barRef} />
            </span>
            <span className="film-count">
              <b>{String(active + 1).padStart(2, "0")}</b> / {total}
            </span>
          </div>
        </div>

        <div className="film-track" ref={trackRef}>
          <div className="film-intro">
            <p className="lede">{dict.features.lede}</p>
            <span className="film-hint">
              {dict.features.scrollHint} <i />
            </span>
          </div>

          {items.map((item, i) => {
            const Icon = featureIcons[i % featureIcons.length];
            return (
              <article
                key={item.title}
                className="film-card"
                data-active={pinned ? i === active : undefined}
              >
                <span className="film-num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="icon-badge">
                  <Icon />
                </span>
                <h3 className="h3">{item.title}</h3>
                <p>{item.text}</p>
                <span className="film-card-line" aria-hidden="true" />
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
