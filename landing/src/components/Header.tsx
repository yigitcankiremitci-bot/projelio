"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { appLinks, path, site } from "@/lib/site";
import { Menu, Close } from "./Icons";

export default function Header({ dict, locale }: { dict: Dict; locale: Locale }) {
  const pathname = usePathname() || `/${locale}`;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const links = [
    { href: path(locale, "#lio"), label: dict.nav.lio },
    { href: path(locale, "#modules"), label: dict.nav.modules },
    { href: path(locale, "screenshots"), label: dict.nav.screenshots },
    // Demo hesabı yalnızca anasayfada bir bölüm; iç sayfalardan da tıklanabilsin
    // diye bağlantı ana sayfanın çapasına gidiyor.
    { href: path(locale, "#demo-account"), label: dict.nav.demoAccount },
    { href: path(locale, "pricing"), label: dict.nav.pricing },
    { href: path(locale, "credits"), label: dict.nav.credits },
    { href: path(locale, "faq"), label: dict.nav.faq },
    { href: path(locale, "contact"), label: dict.nav.contact },
  ];

  /** Aktif dil dışındaki dile aynı sayfada geçiş yapan yol. */
  const swap = (target: Locale) => {
    const rest = pathname.split("/").slice(2).join("/");
    return rest ? `/${target}/${rest}` : `/${target}`;
  };

  const isActive = (href: string) => !href.includes("#") && pathname === href;

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="wrap nav">
        <Link href={path(locale)} className="brand" aria-label={site.name}>
          <Image src="/brand/logo.png" alt="" width={32} height={32} priority />
          <span>Projelio</span>
        </Link>

        <nav className="nav-links" aria-label={dict.nav.menu}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={isActive(l.href) ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="nav-actions">
          <div className="lang-switch" role="group" aria-label="Language">
            <Link href={swap("tr")} aria-current={locale === "tr"} hrefLang="tr">
              TR
            </Link>
            <Link href={swap("en")} aria-current={locale === "en"} hrefLang="en">
              EN
            </Link>
          </div>
          <a className="btn btn-ghost btn-sm" href={appLinks.login}>
            {dict.nav.login}
          </a>
          <a className="btn btn-primary btn-sm" href={appLinks.signup}>
            {dict.nav.cta}
          </a>
        </div>

        <button
          className="burger"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? dict.nav.close : dict.nav.menu}
        >
          {open ? <Close /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="mobile-menu">
          {links.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <div className="btn-row">
            <a className="btn btn-ghost btn-sm" href={appLinks.login}>
              {dict.nav.login}
            </a>
            <a className="btn btn-primary btn-sm" href={appLinks.signup}>
              {dict.nav.cta}
            </a>
            <span className="lang-switch">
              <Link href={swap("tr")} aria-current={locale === "tr"}>
                TR
              </Link>
              <Link href={swap("en")} aria-current={locale === "en"}>
                EN
              </Link>
            </span>
          </div>
        </div>
      )}
    </header>
  );
}
