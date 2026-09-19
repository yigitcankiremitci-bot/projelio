"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Dict } from "@/i18n";
import { ArrowRight, Sparkle } from "./Icons";

/**
 * Departmanlar tek sıra, yana kaydırmalı (uygulamadaki DepartmentsPanel'in
 * "scroll" düzeni gibi); seçili departmanın modülleri hemen altında.
 *
 * Modül listeleri sözlükte (modules.items[].modules) — gerçek katalog
 * veritabanında (module_catalog) duruyor ve landing ona erişemiyor. Katalog
 * değişirse burası elle güncellenmeli.
 */
export default function DepartmentModules({ dict }: { dict: Dict }) {
  const items = dict.modules.items;
  const [selected, setSelected] = useState(0);
  const rowRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  // Oklar yalnızca kaydırılacak yer varken etkin.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const check = () =>
      setEdges({
        start: row.scrollLeft < 4,
        end: row.scrollLeft + row.clientWidth > row.scrollWidth - 4,
      });
    check();
    row.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      row.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const page = (dir: 1 | -1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: "smooth" });
  };

  // Fareyle sürükleyerek kaydırma (dokunmatikte tarayıcı zaten kaydırıyor).
  // 6 px'ten az hareket tıklama sayılır; fazlası sürükleme — bırakınca kartın
  // tıklaması yutulur ki sürükleyen kullanıcı yanlışlıkla departman seçmesin.
  const drag = useRef({ x: 0, left: 0, moved: false, on: false });
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !rowRef.current) return;
    drag.current = { x: e.clientX, left: rowRef.current.scrollLeft, moved: false, on: true };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.on || !rowRef.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    if (d.moved) rowRef.current.scrollLeft = d.left - dx;
  };
  const onUp = () => {
    drag.current.on = false;
  };

  const dept = items[selected];

  return (
    <div className="dept">
      <div className="dept-bar">
        <p className="small muted">{dict.modules.hint}</p>
        <div className="dept-arrows">
          <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label={dict.modules.prev}>
            <ArrowRight style={{ transform: "rotate(180deg)" }} />
          </button>
          <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label={dict.modules.next}>
            <ArrowRight />
          </button>
        </div>
      </div>

      <div
        className="dept-row"
        ref={rowRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        {items.map((m, i) => (
          <button
            type="button"
            key={m.slug}
            className="dept-card"
            aria-pressed={i === selected}
            onClick={(e) => {
              if (drag.current.moved) {
                e.preventDefault();
                return;
              }
              setSelected(i);
            }}
          >
            <figure>
              <Image
                src={`/modules/${m.slug}.webp`}
                alt=""
                width={520}
                height={320}
                sizes="260px"
                loading="lazy"
                draggable={false}
              />
            </figure>
            <span className="dept-card-body">
              <b>{m.title}</b>
              <span>{m.text}</span>
              <em>
                {m.modules.length} {dict.modules.moduleCount}
              </em>
            </span>
          </button>
        ))}
      </div>

      <div className="dept-modules" aria-live="polite">
        <div className="dept-modules-head">
          <h3 className="h3">{dept.title}</h3>
          <span className="pill">
            {dept.modules.length} {dict.modules.moduleCount}
          </span>
        </div>
        {/* key ile her seçimde yeniden basılır; giriş animasyonu tekrar oynar. */}
        <div className="dept-module-grid" key={dept.slug}>
          {dept.modules.map((name, i) => (
            <span className="dept-module" key={name} style={{ animationDelay: `${i * 35}ms` }}>
              <i>
                <Sparkle size={14} />
              </i>
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
