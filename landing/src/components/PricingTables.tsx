"use client";

import { useState } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { checkoutHref, formatNumber, formatTRY, formatUSD, path } from "@/lib/site";
import { CheckSmall } from "./Icons";

type Plan = Dict["pricing"]["plans"][number];

/** Panelden gelen gerçek tutarlar (bkz. lib/plans.ts). */
export interface CanliFiyat {
  key: string;
  priceUsd: { monthly: number; yearly: number };
  charge: { monthly: { amount: number; currency: string } | null; yearly: { amount: number; currency: string } | null };
}

/**
 * Fiyat tabloları.
 *
 * FİYAT PANELDEN GELİR: `canli` dizisi doluysa tutarlar oradan okunur, boşsa
 * sözlükteki yedek kopya kullanılır (API kapalıyken site fiyatsız kalmasın).
 * Sözlükteki sayıya güvenip paneldekini yok saymak, sitede yazan fiyatla
 * çekilen tutarın ayrışması demekti.
 */
export default function PricingTables({
  dict,
  locale,
  canli = [],
}: {
  dict: Dict;
  locale: Locale;
  canli?: CanliFiyat[];
}) {
  const [yearly, setYearly] = useState(false);
  const donem = yearly ? "yearly" : "monthly";

  function fiyat(plan: Plan): number {
    const eslesme = canli.find((c) => c.key === plan.key);
    if (eslesme) return yearly ? eslesme.priceUsd.yearly : eslesme.priceUsd.monthly;
    return yearly ? plan.priceYearly : plan.priceMonthly;
  }

  /** Kartından gerçekten çekilecek tutar; yalnızca panel bildirirse gösterilir. */
  function tahsilat(plan: Plan): string | null {
    const eslesme = canli.find((c) => c.key === plan.key);
    const veri = eslesme ? eslesme.charge[donem] : null;
    if (!veri) return null;
    return veri.currency === "TRY" ? formatTRY(veri.amount, locale) : `${veri.amount} ${veri.currency}`;
  }

  return (
    <>
      <div className="stack center" style={{ alignItems: "center", gap: 18 }}>
        <div className="billing-toggle" role="group">
          <button onClick={() => setYearly(false)} aria-pressed={!yearly}>
            {dict.common.monthly}
          </button>
          <button onClick={() => setYearly(true)} aria-pressed={yearly}>
            {dict.common.yearly}
            <span className="save-badge">{dict.common.save}</span>
          </button>
        </div>
      </div>

      <div className="plans" style={{ marginTop: 34 }}>
        {dict.pricing.plans.map((plan) => {
          const cekilecek = tahsilat(plan);
          return (
            <div key={plan.key} className={plan.featured ? "plan plan-featured" : "plan"}>
              {plan.featured && <span className="plan-flag">{dict.common.mostPopular}</span>}
              <h3>{plan.name}</h3>
              <p className="plan-desc">{plan.desc}</p>

              <div className="price">
                <span className="amount">{formatUSD(fiyat(plan), locale)}</span>
                <span className="per">{yearly ? (locale === "en" ? "/yr" : "/yıl") : dict.common.perMonth}</span>
              </div>
              <div className="price-note">
                {cekilecek
                  ? `${cekilecek} ${locale === "en" ? "charged" : "olarak tahsil edilir"}`
                  : plan.note}
              </div>

              <div className="price-note" style={{ fontWeight: 600 }}>
                {formatNumber(plan.monthlyCredits, locale)} {dict.pricing.creditsLabel}
              </div>

              <ul>
                {plan.features.map((f) => (
                  <li key={f}>
                    <CheckSmall />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/*
                Panele giden dış bağlantı: Next'in <Link>'i uygulama içi yollar
                için, bu adres başka bir alan adı.
              */}
              <a
                className={plan.featured ? "btn btn-primary btn-block" : "btn btn-ghost btn-block"}
                href={checkoutHref(plan.key, donem)}
              >
                {plan.cta}
              </a>
            </div>
          );
        })}
      </div>

      <p className="center small muted" style={{ marginTop: 22 }}>
        {dict.pricing.chargeNote} {dict.pricing.freeNote}
      </p>

      <div className="card center" style={{ marginTop: 26, padding: "24px 22px" }}>
        <h3 className="h3" style={{ marginBottom: 8 }}>
          {dict.pricing.enterprise.title}
        </h3>
        <p className="muted" style={{ marginBottom: 16 }}>
          {dict.pricing.enterprise.desc}
        </p>
        <Link className="btn btn-ghost" href={path(locale, "contact")}>
          {dict.pricing.enterprise.cta}
        </Link>
      </div>
    </>
  );
}
