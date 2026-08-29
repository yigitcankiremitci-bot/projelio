import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDict, locales, type Locale } from "@/i18n";
import { legalContent, legalUpdatedAt } from "@/i18n/legal";
import { legalSlugs, path, site, type LegalSlug } from "@/lib/site";

export function generateStaticParams() {
  return locales.flatMap((lang) => legalSlugs.map((slug) => ({ lang, slug })));
}

function isLegalSlug(v: string): v is LegalSlug {
  return (legalSlugs as readonly string[]).includes(v);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isLegalSlug(slug)) return {};
  const dict = getDict(lang);
  const doc = dict.legal[slug];
  return {
    title: doc.title,
    description: doc.lede,
    alternates: { canonical: `${site.url}/${lang}/legal/${slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function LegalPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  if (!isLegalSlug(slug)) notFound();

  const locale = lang as Locale;
  const dict = getDict(lang);
  const doc = dict.legal[slug];
  const sections = legalContent[slug][locale === "en" ? "en" : "tr"];

  const others = legalSlugs.filter((s) => s !== slug);

  return (
    <section className="section">
      <div className="wrap-narrow">
        <div className="section-head" style={{ marginBottom: 24 }}>
          <span className="eyebrow">{dict.footer.legalTitle}</span>
          <h1 className="h1" style={{ fontSize: "clamp(1.8rem,3.8vw,2.6rem)" }}>
            {doc.title}
          </h1>
          <p className="lede">{doc.lede}</p>
          <p className="xsmall muted" style={{ marginTop: 12 }}>
            {dict.common.updatedAt}: {legalUpdatedAt[slug]} · {site.company.legalName}
          </p>
        </div>

        <div className="alert alert-err" role="note">
          {dict.legal.placeholder}
        </div>

        <div className="prose">
          {sections.map((s) => (
            <section key={s.h}>
              <h2>{s.h}</h2>
              {s.p.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <nav
          style={{
            marginTop: 44,
            paddingTop: 22,
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {others.map((s) => (
            <Link key={s} className="btn btn-ghost btn-sm" href={path(locale, `legal/${s}`)}>
              {dict.legal[s].title}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
