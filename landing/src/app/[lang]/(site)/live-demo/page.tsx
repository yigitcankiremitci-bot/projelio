import type { Metadata } from "next";
import { getDict, type Locale } from "@/i18n";
import { site } from "@/lib/site";
import DemoBooking from "@/components/DemoBooking";

/**
 * Canlı demo sayfası — tanıtım sitesinin menüsü ve alt bilgisiyle.
 *
 * Eskiden bütün "demo" bağlantıları uygulamadaki çıplak randevu sayfasına
 * (app.projelio.app/demo-randevu) gidiyordu: menü, alt bilgi, "ne
 * konuşacağız" hiçbiri yoktu. Takvim artık burada; yönetim bağlantısı
 * (e-postadaki saat değiştir/iptal) uygulamada kalıyor.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const dict = getDict(lang);
  return {
    title: dict.liveDemo.meta.title,
    description: dict.liveDemo.meta.description,
    alternates: { canonical: `${site.url}/${lang}/live-demo` },
  };
}

export default async function LiveDemoPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = lang as Locale;
  const dict = getDict(lang);
  const d = dict.liveDemo;

  return (
    <section className="section">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">{d.eyebrow}</span>
          <h1 className="h1" style={{ fontSize: "clamp(2rem,4.4vw,3.1rem)" }}>
            {d.title}
          </h1>
          <p className="lede">{d.lede}</p>
          <div className="demo-facts">
            {d.facts.map((f) => (
              <span key={f} className="pill">
                {f}
              </span>
            ))}
          </div>
        </div>

        <div className="demo-grid">
          <div className="demo-info">
            <div className="card">
              <h3 className="h3" style={{ marginBottom: 16 }}>
                {d.agendaTitle}
              </h3>
              <ol className="demo-agenda">
                {d.agenda.map((a, i) => (
                  <li key={a.t}>
                    <span className="demo-agenda-no">{i + 1}</span>
                    <div>
                      <strong>{a.t}</strong>
                      <p>{a.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card">
              <h3 className="h3" style={{ marginBottom: 12 }}>
                {d.faqTitle}
              </h3>
              <div className="demo-faq">
                {d.faq.map((f) => (
                  <details key={f.q}>
                    <summary>{f.q}</summary>
                    <p>{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>

          <DemoBooking dict={dict} locale={locale} />
        </div>
      </div>
    </section>
  );
}
