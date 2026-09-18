"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { bakiyeSatinAlHref, formatNumber, formatTRY, path } from "@/lib/site";
import type { BakiyePaketi } from "@/lib/plans";
import type { CanliFiyat } from "@/components/PricingTables";

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
  planlar,
}: {
  dict: Dict;
  locale: Locale;
  /** Panelden canlı paketler; boşsa (API kapalı) sözlükteki yedek kopya. */
  paketler: BakiyePaketi[];
  /** Panelden canlı abonelikler — hesaplayıcı ek paket değil ABONELİK önerir. */
  planlar: CanliFiyat[];
}) {
  const packs: readonly BakiyePaketi[] = paketler.length > 0 ? paketler : dict.credits.packs;
  const [selected, setSelected] = useState(1);
  const [users, setUsers] = useState(1);
  const [perDay, setPerDay] = useState(6);

  const kisiBasi = perDay * 22 * ORTALAMA_ISLEM_BIRIMI;
  const monthly = users * kisiBasi;

  /**
   * ÖNERİ BİR ABONELİKTİR, ek paket değil. Kurgu: Lio Bakiyesi abonelikle gelir,
   * ek bakiye bilerek pahalı (bkz. backend ai-credits.config EK_BAKIYE_CARPANI).
   * Bakiye kişiye tanımlı olduğu için öneri KİŞİ BAŞI ihtiyaca göre.
   * En büyük paket de yetmiyorsa en büyüğü önerilir, fazlası ek bakiyeyle kapanır.
   */
  const onerilenPlan = useMemo(() => {
    const sirali = planlar
      .filter((p) => (p.monthlyCredits ?? 0) > 0)
      .sort((a, b) => (a.monthlyCredits ?? 0) - (b.monthlyCredits ?? 0));
    if (sirali.length === 0) return null;
    return sirali.find((p) => (p.monthlyCredits ?? 0) >= kisiBasi) ?? sirali[sirali.length - 1];
  }, [planlar, kisiBasi]);

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
            {onerilenPlan && (
              <div style={{ textAlign: "right" }}>
                <div className="small muted">{dict.credits.calcSuggestion}</div>
                <Link className="pill" href={path(locale, "pricing")} style={{ marginTop: 4, display: "inline-block" }}>
                  {onerilenPlan.name ?? onerilenPlan.key} · {formatNumber(onerilenPlan.monthlyCredits ?? 0, locale)}{" "}
                  {dict.credits.calcPerMonth}
                </Link>
              </div>
            )}
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
