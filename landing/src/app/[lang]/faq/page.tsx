import type { Metadata } from "next";
import Link from "next/link";
import { getDict, type Locale } from "@/i18n";
import { path, site } from "@/lib/site";
import Faq from "@/components/Faq";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDict(lang);
  return {
    title: dict.faq.hero.title,
    description: dict.faq.hero.lede,
    alternates: { canonical: `${site.url}/${lang}/faq` },
  };
}

export default async function FaqPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: dict.faq.categories.flatMap((c) =>
      c.items.map((i) => ({
        "@type": "Question",
        name: i.q,
        acceptedAnswer: { "@type": "Answer", text: i.a },
      })),
    ),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="section">
        <div className="wrap-narrow">
          <div className="section-head center">
            <span className="eyebrow">{dict.faq.hero.eyebrow}</span>
            <h1 className="h1" style={{ fontSize: "clamp(2rem,4.4vw,3.1rem)" }}>
              {dict.faq.hero.title}
            </h1>
            <p className="lede">{dict.faq.hero.lede}</p>
          </div>

          {dict.faq.categories.map((cat, ci) => (
            <div key={cat.name}>
              <div className="faq-cat">{cat.name}</div>
              <Faq items={[...cat.items]} startOpen={ci === 0 ? 0 : -1} />
            </div>
          ))}

          <div className="card center" style={{ marginTop: 40 }}>
            <h2 className="h3" style={{ marginBottom: 8 }}>
              {dict.contact.hero.title}
            </h2>
            <p className="muted small" style={{ marginBottom: 18 }}>
              {dict.contact.hero.lede}
            </p>
            <Link className="btn btn-primary" href={path(locale, "contact")}>
              {dict.common.talkToUs}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
