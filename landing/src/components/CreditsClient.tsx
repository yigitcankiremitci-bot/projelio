"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { bakiyeSatinAlHref, formatNumber, formatTRY, path } from "@/lib/site";
import type { BakiyePaketi } from "@/lib/plans";

/**
 * Bir Lio işleminin ortalama birim karşılığı — canlı kullanımdan (2026-09, son
 * 30 gün: ortalama ~300, ortanca ~140). Aylık TOPLAM tahmin edildiği için
 * ortanca değil ortalama. Eskiden 3 yazıyordu — birimler yeniden
 * ölçeklenmeden önceki değer; hesaplayıcı her ekibe en küçük paketi öneriyordu.
 * Tüketim tablosuyla uyumlu tutun (i18n/tr.ts credits.usage).
 */
const ORTALAMA_ISLEM_BIRIMI = 300;

export default function CreditsClient({
  dict,
  locale,
  paketler,
}: {
  dict: Dict;
  locale: Locale;
  /** Panelden canlı paketler; boşsa (API kapalı) sözlükteki yedek kopya. */
  paketler: BakiyePaketi[];
}) {
  const packs: readonly BakiyePaketi[] = paketler.length > 0 ? paketler : dict.credits.packs;
  const [selected, setSelected] = useState(1);
  const [users, setUsers] = useState(5);
  const [perDay, setPerDay] = useState(6);

  const monthly = useMemo(() => users * perDay * 22 * ORTALAMA_ISLEM_BIRIMI, [users, perDay]);

  const suggested = useMemo(() => {
    const idx = packs.findIndex((p) => p.credits >= monthly);
    return idx === -1 ? packs.length - 1 : idx;
  }, [monthly, packs]);

  const active = packs[Math.min(selected, packs.length - 1)];
  const totalCredits = active.credits;

  return (
    <>
      <div className="credit-grid">
        {packs.map((pack, i) => {
          const unit = (pack.price / pack.credits) * 1000;
          return (
            <button
              key={pack.key}
              type="button"
              className="credit-pack"
              data-selected={selected === i}
              onClick={() => setSelected(i)}
              aria-pressed={selected === i}
            >
              <div className="credit-amount">{formatNumber(pack.credits, locale)}</div>
              <div className="credit-price">{formatTRY(pack.price, locale)}</div>
              <div className="credit-unit">
                {formatTRY(unit, locale)} · {dict.credits.unitLabel}
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
        <a className="btn btn-primary" href={bakiyeSatinAlHref(active.key)}>
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
                  <td style={{ whiteSpace: "nowrap" }}>{row[1]}</td>
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
