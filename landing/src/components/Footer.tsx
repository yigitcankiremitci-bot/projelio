import Link from "next/link";
import Image from "next/image";
import type { Dict, Locale } from "@/i18n";
import { appLinks, path, site } from "@/lib/site";

export default function Footer({ dict, locale }: { dict: Dict; locale: Locale }) {
  const year = new Date().getFullYear();

  const product = [
    { href: path(locale, "#lio"), label: dict.nav.lio },
    { href: path(locale, "#modules"), label: dict.nav.modules },
    { href: path(locale, "screenshots"), label: dict.nav.screenshots },
    { href: path(locale, "pricing"), label: dict.nav.pricing },
    { href: path(locale, "credits"), label: dict.nav.credits },
  ];

  const company = [
    { href: path(locale, "faq"), label: dict.nav.faq },
    { href: path(locale, "contact"), label: dict.nav.contact },
  ];

  const legal = [
    { href: path(locale, "legal/privacy"), label: dict.legal.privacy.title },
    { href: path(locale, "legal/terms"), label: dict.legal.terms.title },
    { href: path(locale, "legal/kvkk"), label: dict.legal.kvkk.title },
    { href: path(locale, "legal/distance"), label: dict.legal.distance.title },
    { href: path(locale, "legal/refund"), label: dict.legal.refund.title },
  ];

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <Image src="/brand/logo.png" alt="" width={30} height={30} />
              <span>Projelio</span>
            </div>
            <p style={{ maxWidth: "38ch" }}>{dict.footer.about}</p>
            <p style={{ marginTop: 16 }}>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </p>
          </div>

          <div>
            <h4>{dict.footer.productTitle}</h4>
            <ul>
              {product.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>{dict.footer.companyTitle}</h4>
            <ul>
              {company.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
              <li>
                <a href={appLinks.login}>{dict.nav.login}</a>
              </li>
            </ul>
          </div>

          <div>
            <h4>{dict.footer.legalTitle}</h4>
            <ul>
              {legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {year} {site.name}. {dict.footer.rights}
          </span>
          <span>{dict.footer.madeIn}</span>
        </div>
      </div>
    </footer>
  );
}
