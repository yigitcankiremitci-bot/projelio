import Image from "next/image";
import Link from "next/link";
import { getDict, type Locale } from "@/i18n";
import { appLinks, path, site } from "@/lib/site";
import LioDemo from "@/components/LioDemo";
import Reveal from "@/components/Reveal";
import Faq from "@/components/Faq";
import MockScreen from "@/components/MockScreens";
import Stats from "@/components/Stats";
import HowSteps from "@/components/HowSteps";
import LiveProduct from "@/components/LiveProduct";
import { ArrowRight, CheckSmall, featureIcons, lioIcons, securityIcons } from "@/components/Icons";

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);

  const faqPreview = dict.faq.categories[0].items.slice(0, 5);
  const faqJsonLd = {
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

  /** Başlığı kelimelere böler; her kelime sırayla belirir. */
  let wordIndex = 0;
  const animateWords = (text: string, highlight = false) =>
    text
      .split(" ")
      .filter(Boolean)
      .map((word) => (
        <span
          key={`${word}-${wordIndex}`}
          className={highlight ? "word gradient-text" : "word"}
          style={{ animationDelay: `${wordIndex++ * 70}ms` }}
        >
          {word}
        </span>
      ));

  const cmpCell = (value: string) => {
    if (value === "yes") return <span className="yes">✓</span>;
    if (value === "no") return <span className="no">—</span>;
    if (value === "partial") return <span className="muted">{dict.compare.legend.partial}</span>;
    return <span>{value}</span>;
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* ---------------------------------------------------------- HERO -- */}
      <section className="hero">
        <div className="hero-bg" aria-hidden="true">
          <span className="orb orb-1" />
          <span className="orb orb-2" />
          <span className="orb orb-3" />
        </div>
        <div className="wrap hero-grid">
          <div>
            <span className="pill">{dict.hero.badge}</span>
            <h1 className="h1" style={{ marginTop: 18 }}>
              {animateWords(dict.hero.titleA)}
              {animateWords(dict.hero.titleHighlight, true)}
              {dict.hero.titleB ? animateWords(dict.hero.titleB) : null}
            </h1>
            <p className="lede">{dict.hero.lede}</p>
            <div className="btn-row">
              <a className="btn btn-primary btn-lg" href="#demo">
                {dict.hero.ctaPrimary}
              </a>
              <Link className="btn btn-ghost btn-lg" href={path(locale, "pricing")}>
                {dict.hero.ctaSecondary}
              </Link>
            </div>
            <div className="hero-proof">
              {dict.hero.proof.map((p) => (
                <span key={p}>
                  <i className="check-dot">
                    <CheckSmall size={11} />
                  </i>
                  {p}
                </span>
              ))}
            </div>
          </div>

          <LioDemo dict={dict} />
        </div>
      </section>

      {/* --------------------------------------------------------- STATS -- */}
      <section className="section-tight" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <Reveal>
            <Stats dict={dict} locale={locale} />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- PROBLEM -- */}
      <section className="section section-alt">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.problem.eyebrow}</span>
            <h2 className="h2">{dict.problem.title}</h2>
            <p className="lede">{dict.problem.lede}</p>
          </div>
          <div className="grid grid-3">
            {dict.problem.items.map((item, i) => (
              <Reveal key={item.title} delay={i * 80}>
                <div className="card card-hover" style={{ height: "100%" }}>
                  <h3 className="h3">{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- HOW -- */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.how.eyebrow}</span>
            <h2 className="h2">{dict.how.title}</h2>
            <p className="lede">{dict.how.lede}</p>
          </div>
          <HowSteps dict={dict} locale={locale} />
        </div>
      </section>

      {/* ---------------------------------------------------------- LIVE -- */}
      <section className="section section-alt">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.live.eyebrow}</span>
            <h2 className="h2">{dict.live.title}</h2>
            <p className="lede">{dict.live.lede}</p>
          </div>
          <LiveProduct dict={dict} locale={locale} />
        </div>
      </section>

      {/* --------------------------------------------------- DEMO HESABI -- */}
      {/*
        Kimlik bilgileri bilerek açıkta: hesap herkese açık bir demo, sır değil.
        Aynı bilgiler panelin giriş ekranında da yazıyor; tek kaynağı
        lib/site.ts içindeki `site.demo`.
        id="demo" ZATEN Lio sohbet kutusunda kullanılıyor (bkz. LioDemo.tsx),
        bu yüzden buranın çapası "demo-account".
      */}
      <section className="section" id="demo-account">
        <div className="wrap">
          <div className="demo-account">
            <div>
              <span className="eyebrow">{dict.demoAccount.eyebrow}</span>
              <h2 className="h2" style={{ marginTop: 14 }}>
                {dict.demoAccount.title}
              </h2>
              <p className="lede">{dict.demoAccount.lede}</p>
              <ul className="demo-account-list">
                {dict.demoAccount.points.map((point) => (
                  <li key={point}>
                    <i className="check-dot">
                      <CheckSmall size={11} />
                    </i>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <Reveal>
              <div className="demo-account-card">
                <div className="demo-account-cred">
                  <span>{dict.demoAccount.emailLabel}</span>
                  <b>{site.demo.email}</b>
                </div>
                <div className="demo-account-cred">
                  <span>{dict.demoAccount.passwordLabel}</span>
                  <b>{site.demo.password}</b>
                </div>
                <a
                  className="btn btn-primary btn-lg btn-block"
                  style={{ marginTop: 18 }}
                  href={appLinks.demo}
                >
                  {dict.demoAccount.cta} <ArrowRight />
                </a>
                <p className="xsmall demo-account-note">{dict.demoAccount.ctaNote}</p>
                <p className="small demo-account-reset">{dict.demoAccount.resetNote}</p>
                <p className="demo-account-warn">{dict.demoAccount.warning}</p>
                <p className="small" style={{ marginTop: 16 }}>
                  {dict.demoAccount.ownAccount}{" "}
                  <a href={appLinks.signup}>{dict.common.startFree}</a>
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- LIO -- */}
      <section className="section section-dark" id="lio">
        <div className="wrap">
          <div className="section-head center">
            <span className="eyebrow">{dict.lio.eyebrow}</span>
            <h2 className="h2">{dict.lio.title}</h2>
            <p className="lede">{dict.lio.lede}</p>
          </div>
          <div className="grid grid-3">
            {dict.lio.items.map((item, i) => {
              const Icon = lioIcons[i % lioIcons.length];
              return (
                <Reveal key={item.title} delay={i * 60}>
                  <div
                    className="card"
                    style={{
                      height: "100%",
                      background: "rgba(255,255,255,.05)",
                      borderColor: "rgba(255,255,255,.12)",
                      color: "#fff",
                    }}
                  >
                    <span
                      className="icon-badge"
                      style={{
                        background: "rgba(192,129,63,.18)",
                        borderColor: "rgba(224,176,119,.3)",
                        color: "var(--bronze-400)",
                      }}
                    >
                      <Icon />
                    </span>
                    <h3 className="h3">{item.title}</h3>
                    <p style={{ color: "var(--navy-200)" }}>{item.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- MODULES -- */}
      <section className="section" id="modules">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.modules.eyebrow}</span>
            <h2 className="h2">{dict.modules.title}</h2>
            <p className="lede">{dict.modules.lede}</p>
          </div>
          <div className="grid grid-4">
            {dict.modules.items.map((m, i) => (
              <Reveal key={m.slug} delay={(i % 4) * 70}>
                <article className="module-card" style={{ height: "100%" }}>
                  <figure>
                    <Image
                      src={`/modules/${m.slug}.webp`}
                      alt={m.title}
                      width={800}
                      height={600}
                      sizes="(max-width: 700px) 100vw, (max-width: 1000px) 50vw, 25vw"
                      loading="lazy"
                    />
                  </figure>
                  <div className="body">
                    <h3>{m.title}</h3>
                    <p>{m.text}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
          <div className="center" style={{ marginTop: 34 }}>
            <Link className="btn btn-ghost" href={path(locale, "contact")}>
              {dict.modules.cta} <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ FEATURES -- */}
      <section className="section section-alt" id="features">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.features.eyebrow}</span>
            <h2 className="h2">{dict.features.title}</h2>
            <p className="lede">{dict.features.lede}</p>
          </div>
          <div className="grid grid-4">
            {dict.features.items.map((item, i) => {
              const Icon = featureIcons[i % featureIcons.length];
              return (
                <Reveal key={item.title} delay={(i % 4) * 60}>
                  <div className="card card-hover" style={{ height: "100%" }}>
                    <span className="icon-badge">
                      <Icon />
                    </span>
                    <h3 className="h3">{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- SCREENSHOTS -- */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.screenshots.eyebrow}</span>
            <h2 className="h2">{dict.screenshots.title}</h2>
            <p className="lede">{dict.screenshots.lede}</p>
          </div>
          <div className="grid grid-2">
            {dict.screenshots.items.slice(0, 2).map((shot, i) => (
              <Reveal key={shot.title} delay={i * 90}>
                <div className="shot">
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
          <div className="center" style={{ marginTop: 30 }}>
            <Link className="btn btn-ghost" href={path(locale, "screenshots")}>
              {dict.nav.screenshots} <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- COMPARE -- */}
      <section className="section section-alt">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.compare.eyebrow}</span>
            <h2 className="h2">{dict.compare.title}</h2>
            <p className="lede">{dict.compare.lede}</p>
          </div>
          <div className="table-scroll">
            <table className="cmp">
              <thead>
                <tr>
                  {dict.compare.columns.map((c, i) => (
                    <th key={c || i} className={i === 1 ? "us" : undefined}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dict.compare.rows.map((row) => (
                  <tr key={row[0]}>
                    <td>{row[0]}</td>
                    <td className="us">{cmpCell(row[1])}</td>
                    <td>{cmpCell(row[2])}</td>
                    <td>{cmpCell(row[3])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ SECURITY -- */}
      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">{dict.security.eyebrow}</span>
            <h2 className="h2">{dict.security.title}</h2>
            <p className="lede">{dict.security.lede}</p>
          </div>
          <div className="grid grid-3">
            {dict.security.items.map((item, i) => {
              const Icon = securityIcons[i % securityIcons.length];
              return (
                <Reveal key={item.title} delay={(i % 3) * 70}>
                  <div className="card" style={{ height: "100%" }}>
                    <span className="icon-badge">
                      <Icon />
                    </span>
                    <h3 className="h3">{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- FAQ -- */}
      <section className="section section-alt">
        <div className="wrap-narrow">
          <div className="section-head center">
            <span className="eyebrow">{dict.faq.hero.eyebrow}</span>
            <h2 className="h2">{dict.faq.hero.title}</h2>
          </div>
          <Faq items={[...faqPreview]} startOpen={0} />
          <div className="center" style={{ marginTop: 26 }}>
            <Link className="btn btn-ghost" href={path(locale, "faq")}>
              {dict.nav.faq} <ArrowRight />
            </Link>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- CTA -- */}
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
