"use client";

import { useRef, useState } from "react";
import type { Dict } from "@/i18n";
import { useScrollFilm } from "@/lib/useScrollFilm";

/**
 * "Bir işin yolculuğu": dört tam ekran sahne, aşağı kaydırdıkça yana akar
 * (yapışma mantığı useScrollFilm'de). Dar ekranda sahneler alt alta dizilir.
 *
 * Sahnelerdeki görseller tamamen süs — anlatı metinde; bu yüzden görseller
 * aria-hidden, ekran okuyucu yalnızca başlık ve açıklamayı duyar.
 */
export default function JourneyFilm({ dict }: { dict: Dict }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [scene, setScene] = useState(0);
  const j = dict.journey;
  const count = j.scenes.length;

  useScrollFilm(sectionRef, trackRef, (progress) => {
    if (barRef.current) barRef.current.style.transform = `scaleX(${progress})`;
    setScene(Math.min(count - 1, Math.round(progress * (count - 1))));
  });

  const visuals = [
    <div className="jv jv-command" key="command">
      <div className="voice-wave">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <div className="command-line">
        <span className="lio-symbol">✦</span>
        <p>{j.command}</p>
      </div>
      <div className="parsed-row">
        {j.parsed.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </div>,

    <div className="jv jv-constellation" key="constellation">
      <svg viewBox="0 0 700 460">
        <g className="const-lines">
          <path d="M350 230L125 95M350 230L565 80M350 230L600 325M350 230L155 370" />
          <path d="M125 95L565 80M155 370L600 325" />
        </g>
        {j.nodes.map(([label, value], i) => {
          const [cx, cy] = [
            [125, 95],
            [565, 80],
            [600, 325],
            [155, 370],
          ][i];
          return (
            <g className={`node n${i + 1}`} key={label}>
              <circle cx={cx} cy={cy} r="44" />
              <text x={cx} y={cy - 3}>
                {label}
              </text>
              <text x={cx} y={cy + 15} className="sub">
                {value}
              </text>
            </g>
          );
        })}
        <g className="core">
          <circle cx="350" cy="230" r="78" />
          <circle cx="350" cy="230" r="55" />
          <text x="350" y="242">
            ✦
          </text>
        </g>
      </svg>
    </div>,

    <div className="jv jv-board" key="board">
      <div className="mini-board">
        {j.columns.map((col, c) => (
          <div className="board-col" key={col}>
            <small>
              {col} <b>{[2, 2, 8][c]}</b>
            </small>
            <div className={`board-card${c === 0 ? " moving" : ""}`}>
              <i />
              <b>{j.cards[c][0]}</b>
              <span>{j.cards[c][1]}</span>
              <footer>
                <em>{["AY", "ME", "ST"][c]}</em>
                <small>{j.cards[c][2]}</small>
              </footer>
            </div>
            {c === 0 && <div className="board-card muted" />}
          </div>
        ))}
      </div>
      <div className="action-toast">
        <span>✓</span>
        <div>
          <b>{j.toastTitle}</b>
          <small>{j.toastText}</small>
        </div>
      </div>
    </div>,

    <div className="jv jv-insight" key="insight">
      <div className="insight-card">
        <div className="insight-top">
          <span className="lio-symbol">✦</span>
          <div>
            <b>{j.insightLabel}</b>
            <small>{j.insightAgo}</small>
          </div>
          <i>{j.insightLive}</i>
        </div>
        <h3>{j.insightTitle}</h3>
        <p>{j.insightText}</p>
        <div className="impact">
          <span>
            <small>{j.riskLabel}</small>
            <b>%64</b>
          </span>
          <div>
            <i />
          </div>
          <span>
            <small>{j.impactLabel}</small>
            <b>{j.impactValue}</b>
          </span>
        </div>
        <span className="insight-action">
          {j.insightAction} <span>→</span>
        </span>
      </div>
    </div>,
  ];

  return (
    <section className="journey" id="journey" ref={sectionRef}>
      <div className="journey-sticky">
        <div className="journey-head">
          <span>{j.eyebrow}</span>
          <span className="film-progress">
            <span ref={barRef} />
          </span>
          <span>
            <b>{String(scene + 1).padStart(2, "0")}</b> / {String(count).padStart(2, "0")}
          </span>
        </div>

        <div className="journey-track" ref={trackRef}>
          {j.scenes.map((s, i) => (
            <article className="journey-scene" key={s.title} data-active={i === scene}>
              <div className="scene-copy">
                <span className="scene-kicker">
                  {String(i + 1).padStart(2, "0")} · {s.kicker}
                </span>
                <h2>{s.title}</h2>
                <p>{s.text}</p>
              </div>
              <div className="scene-visual" aria-hidden="true">
                {visuals[i]}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
