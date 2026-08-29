import type { Metadata } from "next";
import Link from "next/link";
import { getDict, type Locale } from "@/i18n";
import { appLinks, path, site } from "@/lib/site";
import CreditsClient from "@/components/CreditsClient";
import Faq from "@/components/Faq";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDict(lang);
  return {
    title: dict.credits.hero.title,
    description: dict.credits.hero.lede,
    alternates: { canonical: `${site.url}/${lang}/credits` },
  };
}

export default async function CreditsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);

  return (
    <>
      <section className="section" style={{ paddingBottom: 40 }}>
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow">{dict.credits.hero.eyebrow}</span>
            <h1 className="h1" style={{ fontSize: "clamp(2rem,4.4vw,3.1rem)" }}>
              {dict.credits.hero.title}
            </h1>
            <p className="lede">{dict.credits.hero.lede}</p>
          </div>

          <div className="section-head" style={{ marginBottom: 26 }}>
            <h2 className="h3">{dict.credits.packsTitle}</h2>
            <p className="muted small" style={{ marginTop: 8 }}>
              {dict.credits.packsLede}
            </p>
          </div>

          <CreditsClient dict={dict} locale={locale} />
        </div>
      </section>

      <section className="section section-alt">
        <div className="wrap-narrow">
          <div className="section-head center">
            <h2 className="h2">{dict.credits.faqTitle}</h2>
          </div>
          <Faq items={[...dict.credits.faq]} startOpen={0} />
          <p className="center small muted" style={{ marginTop: 24 }}>
            <Link href={path(locale, "legal/refund")} style={{ textDecoration: "underline" }}>
              {dict.legal.refund.title}
            </Link>
            {" · "}
            <Link href={path(locale, "legal/distance")} style={{ textDecoration: "underline" }}>
              {dict.legal.distance.title}
            </Link>
          </p>
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
