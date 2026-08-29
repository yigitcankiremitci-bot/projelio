"use client";

import { useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { appLinks, formatTRY, path } from "@/lib/site";
import { CheckSmall } from "./Icons";
import Link from "next/link";

type Plan = Dict["pricing"]["personal"][number];

export default function PricingTables({ dict, locale }: { dict: Dict; locale: Locale }) {
  const [tab, setTab] = useState<"personal" | "business">("personal");
  const [yearly, setYearly] = useState(false);

  const plans: Plan[] = tab === "personal" ? dict.pricing.personal : dict.pricing.business;

  function renderPrice(plan: Plan) {
    if (plan.priceMonthly < 0) {
      return <span className="amount" style={{ fontSize: "1.9rem" }}>{plan.priceLabel}</span>;
    }
    if (plan.priceMonthly === 0) {
      return <span className="amount">{plan.priceLabel}</span>;
    }
    const monthly = yearly ? Math.round(plan.priceYearly / 12) : plan.priceMonthly;
    return (
      <>
        <span className="amount">{formatTRY(monthly, locale)}</span>
        <span className="per">{plan.perUser ? dict.common.perUserMonth : dict.common.perMonth}</span>
      </>
    );
  }

  function ctaHref(plan: Plan) {
    if (plan.priceMonthly < 0 || plan.cta.toLowerCase().includes("sat") || plan.cta.toLowerCase().includes("sales") || plan.cta.toLowerCase().includes("quote")) {
      return path(locale, "contact");
    }
    return appLinks.signup;
  }

  return (
    <>
      <div className="stack center" style={{ alignItems: "center", gap: 18 }}>
        <div className="plan-tabs" role="group">
          <button onClick={() => setTab("personal")} aria-pressed={tab === "personal"}>
            {dict.pricing.tabs.personal}
          </button>
          <button onClick={() => setTab("business")} aria-pressed={tab === "business"}>
            {dict.pricing.tabs.business}
          </button>
        </div>

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
        {plans.map((plan) => {
          const href = ctaHref(plan);
          const external = href.startsWith("http");
          return (
            <div key={plan.name} className={plan.featured ? "plan plan-featured" : "plan"}>
              {plan.featured && <span className="plan-flag">{dict.common.mostPopular}</span>}
              <h3>{plan.name}</h3>
              <p className="plan-desc">{plan.desc}</p>

              <div className="price">{renderPrice(plan)}</div>
              <div className="price-note">
                {yearly && plan.priceMonthly > 0
                  ? `${formatTRY(plan.priceYearly, locale)} / ${locale === "en" ? "year" : "yıl"}`
                  : plan.note}
              </div>

              <ul>
                {plan.features.map((f) => (
                  <li key={f}>
                    <CheckSmall />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {external ? (
                <a
                  className={plan.featured ? "btn btn-primary btn-block" : "btn btn-ghost btn-block"}
                  href={href}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  className={plan.featured ? "btn btn-primary btn-block" : "btn btn-ghost btn-block"}
                  href={href}
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="center small muted" style={{ marginTop: 22 }}>
        {dict.common.vatNote}
      </p>
    </>
  );
}
