import type { Metadata } from "next";
import Link from "next/link";
import { getDict, type Locale } from "@/i18n";
import { appLinks, path, site } from "@/lib/site";
import PricingTables from "@/components/PricingTables";
import Faq from "@/components/Faq";
import { ArrowRight, CheckSmall } from "@/components/Icons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDict(lang);
  return {
    title: dict.pricing.hero.title,
    description: dict.pricing.hero.lede,
    alternates: { canonical: `${site.url}/${lang}/pricing` },
  };
}

export default async function PricingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);
  const pricingFaq = dict.faq.categories[2].items;

  return (
    <>
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <div className="section-head center" style={{ marginBottom: 34 }}>
            <span className="eyebrow">{dict.pricing.hero.eyebrow}</span>
            <h1 className="h1" style={{ fontSize: "clamp(2rem,4.4vw,3.1rem)" }}>
              {dict.pricing.hero.title}
            </h1>
            <p className="lede">{dict.pricing.hero.lede}</p>
          </div>

          <PricingTables dict={dict} locale={locale} />
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="card" style={{ padding: "30px 28px" }}>
            <h2 className="h3" style={{ marginBottom: 18 }}>
              {dict.pricing.addons.title}
            </h2>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                display: "grid",
                gap: 12,
                gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
              }}
            >
              {dict.pricing.addons.items.map((item) => (
                <li key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "var(--ok)", marginTop: 3 }}>
                    <CheckSmall />
                  </span>
                  <span className="muted">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div
            className="card"
            style={{
              marginTop: 20,
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <h2 className="h3">{dict.credits.hero.title}</h2>
              <p className="muted small" style={{ maxWidth: "60ch" }}>
                {dict.credits.hero.lede}
              </p>
            </div>
            <Link className="btn btn-ghost" href={path(locale, "credits")}>
              {dict.nav.credits} <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap-narrow">
          <div className="section-head center">
            <h2 className="h2">{dict.pricing.faqTitle}</h2>
          </div>
          <Faq items={[...pricingFaq]} startOpen={0} />
        </div>
      </section>

      <section className="section-tight">
        <div className="wrap">
          <div className="cta-band on-dark">
            <h2 className="h2">{dict.ctaBand.title}</h2>
            <p>{dict.ctaBand.text}</p>
            <div className="btn-row">
              <a className="btn btn-primary btn-lg" href={appLinks.signup}>
                {dict.ctaBand.primary}
              </a>
              <Link className="btn btn-ghost btn-lg" href={path(locale, "contact")}>
                {dict.ctaBand.secondary}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
