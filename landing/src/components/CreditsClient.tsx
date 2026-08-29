"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { appLinks, formatNumber, formatTRY, path } from "@/lib/site";

export default function CreditsClient({ dict, locale }: { dict: Dict; locale: Locale }) {
  const packs = dict.credits.packs;
  const [selected, setSelected] = useState(1);
  const [users, setUsers] = useState(5);
  const [perDay, setPerDay] = useState(6);

  /** Ortalama bir Lio işleminin maliyeti ~3 kredi kabul edilir. */
  const monthly = useMemo(() => users * perDay * 22 * 3, [users, perDay]);

  const suggested = useMemo(() => {
    const idx = packs.findIndex((p) => p.credits + p.bonus >= monthly);
    return idx === -1 ? packs.length - 1 : idx;
  }, [monthly, packs]);

  const active = packs[selected];
  const totalCredits = active.credits + active.bonus;

  return (
    <>
      <div className="credit-grid">
        {packs.map((pack, i) => {
          const total = pack.credits + pack.bonus;
          const unit = (pack.price / total) * 1000;
          return (
            <button
              key={pack.credits}
              type="button"
              className="credit-pack"
              data-selected={selected === i}
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
            >
              <div className="credit-amount">{formatNumber(pack.credits, locale)}</div>
              {pack.bonus > 0 && (
                <span className="credit-bonus">
                  +{formatNumber(pack.bonus, locale)} {dict.credits.bonusLabel}
                </span>
              )}
              <div className="credit-price">{formatTRY(pack.price, locale)}</div>
              <div className="credit-unit">
                {formatTRY(Math.round(unit), locale)} · {dict.credits.unitLabel}
              </div>
            </button>
          );
        })}
      </div>

      <div
        className="card"
        style={{
          marginTop: 26,
          display: "flex",
          flexWrap: "wrap",
          gap: 18,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div className="small muted">{dict.credits.totalCredits}</div>
          <strong style={{ fontSize: "1.5rem" }}>
            {formatNumber(totalCredits, locale)}
          </strong>
          <span className="muted"> · {formatTRY(active.price, locale)}</span>
        </div>
        <a className="btn btn-primary" href={appLinks.credits}>
          {dict.credits.buy}
        </a>
      </div>

      <div className="grid grid-2" style={{ marginTop: 46, alignItems: "start" }}>
        <div className="card">
          <h3>{dict.credits.calcTitle}</h3>
          <p style={{ marginBottom: 22 }}>{dict.credits.calcLede}</p>

          <div className="slider-row">
            <label htmlFor="users">
              {dict.credits.calcUsers}: <strong>{users}</strong>
            </label>
            <input
              id="users"
              type="range"
              min={1}
              max={60}
              value={users}
              onChange={(e) => setUsers(Number(e.target.value))}
            />
          </div>

          <div className="slider-row" style={{ marginTop: 16 }}>
            <label htmlFor="perday">
              {dict.credits.calcPerDay}: <strong>{perDay}</strong>
            </label>
            <input
              id="perday"
              type="range"
              min={1}
              max={40}
              value={perDay}
              onChange={(e) => setPerDay(Number(e.target.value))}
            />
          </div>

          <div
            style={{
              marginTop: 24,
              paddingTop: 20,
              borderTop: "1px solid var(--line)",
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div className="small muted">{dict.credits.calcResult}</div>
              <strong style={{ fontSize: "1.6rem" }}>{formatNumber(monthly, locale)}</strong>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="small muted">{dict.credits.calcSuggestion}</div>
              <button
                type="button"
                className="pill"
                style={{ cursor: "pointer", marginTop: 4 }}
                onClick={() => setSelected(suggested)}
              >
                {formatNumber(packs[suggested].credits, locale)} · {formatTRY(packs[suggested].price, locale)}
              </button>
            </div>
          </div>

          <p className="form-note">{dict.credits.calcNote}</p>
        </div>

        <div className="card">
          <h3>{dict.credits.usageTitle}</h3>
          <p style={{ marginBottom: 14 }}>{dict.credits.usageLede}</p>
          <table className="usage-table">
            <thead>
              <tr>
                <th>{dict.credits.usageHead[0]}</th>
                <th>{dict.credits.usageHead[1]}</th>
              </tr>
            </thead>
            <tbody>
              {dict.credits.usage.map((row) => (
                <tr key={row[0]}>
                  <td>{row[0]}</td>
                  <td>{row[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="form-note">
            <Link href={path(locale, "pricing")} style={{ textDecoration: "underline" }}>
              {dict.nav.pricing}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
