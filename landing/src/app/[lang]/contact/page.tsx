import type { Metadata } from "next";
import { getDict, type Locale } from "@/i18n";
import { site } from "@/lib/site";
import ContactForm from "@/components/ContactForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDict(lang);
  return {
    title: dict.contact.hero.title,
    description: dict.contact.hero.lede,
    alternates: { canonical: `${site.url}/${lang}/contact` },
  };
}

export default async function ContactPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);

  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">{dict.contact.hero.eyebrow}</span>
          <h1 className="h1" style={{ fontSize: "clamp(2rem,4.4vw,3.1rem)" }}>
            {dict.contact.hero.title}
          </h1>
          <p className="lede">{dict.contact.hero.lede}</p>
        </div>

        <div
          className="grid"
          style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 24, alignItems: "start" }}
        >
          <div
            style={{
              display: "grid",
              gap: 24,
              gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)",
            }}
            className="contact-grid"
          >
            <ContactForm dict={dict} locale={locale} />

            <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
              <div className="card">
                <h3 className="h3" style={{ marginBottom: 14 }}>
                  {dict.contact.infoTitle}
                </h3>
                <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 14 }}>
                  {dict.contact.channels.map((c) => (
                    <li key={c.label}>
                      <div className="xsmall muted">{c.label}</div>
                      {c.href ? (
                        <a href={c.href} style={{ fontWeight: 600 }}>
                          {c.value}
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{c.value}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <h3 className="h3" style={{ marginBottom: 8 }}>
                  {dict.contact.demoTitle}
                </h3>
                <p>{dict.contact.demoText}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html:
            "@media (max-width: 900px){.contact-grid{grid-template-columns:minmax(0,1fr) !important}}",
        }}
      />
    </section>
  );
}
