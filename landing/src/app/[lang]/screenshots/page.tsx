import type { Metadata } from "next";
import Link from "next/link";
import { getDict, type Locale } from "@/i18n";
import { appLinks, path, site } from "@/lib/site";
import MockScreen from "@/components/MockScreens";
import Reveal from "@/components/Reveal";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDict(lang);
  return {
    title: dict.screenshots.title,
    description: dict.screenshots.lede,
    alternates: { canonical: `${site.url}/${lang}/screenshots` },
  };
}

export default async function ScreenshotsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);

  return (
    <>
      <section className="section">
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow">{dict.screenshots.eyebrow}</span>
            <h1 className="h1" style={{ fontSize: "clamp(2rem,4.4vw,3.1rem)" }}>
              {dict.screenshots.title}
            </h1>
            <p className="lede">{dict.screenshots.lede}</p>
          </div>

          <div className="grid grid-2">
            {dict.screenshots.items.map((shot, i) => (
              <Reveal key={shot.title} delay={(i % 2) * 90}>
                <div className="shot" style={{ height: "100%" }}>
                  <div className="shot-frame">
                    <i />
                    <i />
                    <i />
                    <span>{shot.frame}</span>
                  </div>
                  <div className="shot-body">
                    <MockScreen kind={shot.kind} locale={locale} />
                  </div>
                  <div className="shot-caption">
                    <h3>{shot.title}</h3>
                    <p>{shot.text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
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
