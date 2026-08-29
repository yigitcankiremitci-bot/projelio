"use client";

import { useState } from "react";
import { Plus } from "./Icons";

export type QA = { q: string; a: string };

export default function Faq({ items, startOpen = -1 }: { items: QA[]; startOpen?: number }) {
  const [open, setOpen] = useState(startOpen);

  return (
    <div className="faq-list">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div className="faq-item" key={item.q} data-open={isOpen}>
            <button
              className="faq-q"
              onClick={() => setOpen(isOpen ? -1 : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-a-${i}`}
              id={`faq-q-${i}`}
            >
              <span>{item.q}</span>
              <Plus />
            </button>
            {isOpen && (
              <div className="faq-a" id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}>
                {item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
