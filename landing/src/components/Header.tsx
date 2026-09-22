"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { appLinks, dilliAdres, path, site } from "@/lib/site";
import { Menu, Close } from "./Icons";

type NavLink = { href: string; label: string; desc?: string };
type NavGroup = { id: string; label: string; links: NavLink[] };

/**
 * Üst menü dört ana ögeye indirildi (Ürün, Fiyatlandırma, Demo Hesabı,
 * Destek); diğer sayfalar açılır menülerde gruplu. Eskiden sekiz bağlantı yan
 * yana diziliyordu ve dar masaüstünde iki satıra kırılıyordu.
 *
 * Açılır menü masaüstünde üzerine gelince (CSS :hover) ve tıklayınca açılır —
 * tıklama dokunmatik dizüstüler ve klavye için; dışarı tıklamak ya da Esc
 * kapatır.
 */
export default function Header({ dict, locale }: { dict: Dict; locale: Locale }) {
  const pathname = usePathname() || `/${locale}`;
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const d = dict.nav.desc;
  const groups: NavGroup[] = [
    {
      id: "product",
      label: dict.nav.groups.product,
      links: [
        { href: path(locale, "#lio"), label: dict.nav.lio, desc: d.lio },
        { href: path(locale, "#journey"), label: dict.nav.journey, desc: d.journey },
        { href: path(locale, "#features"), label: dict.nav.features, desc: d.features },
        { href: path(locale, "#modules"), label: dict.nav.modules, desc: d.modules },
        { href: path(locale, "screenshots"), label: dict.nav.screenshots, desc: d.screenshots },
      ],
    },
    {
      id: "pricing",
      label: dict.nav.groups.pricing,
      links: [
        { href: path(locale, "pricing"), label: dict.nav.packages, desc: d.packages },
        { href: path(locale, "lio-units"), label: dict.nav.credits, desc: d.credits },
      ],
    },
    {
      id: "support",
      label: dict.nav.groups.support,
      links: [
        { href: path(locale, "live-demo"), label: dict.nav.liveDemo, desc: d.liveDemo },
        { href: path(locale, "faq"), label: dict.nav.faq, desc: d.faq },
        { href: path(locale, "contact"), label: dict.nav.contact, desc: d.contact },
      ],
    },
  ];
  // Demo hesabı yalnızca anasayfada bir bölüm; iç sayfalardan da tıklanabilsin
  // diye bağlantı ana sayfanın çapasına gidiyor. Dönüşümün en kısa yolu olduğu
  // için gruba gömülmedi, tek başına duruyor.
  const demo: NavLink = { href: path(locale, "#demo-account"), label: dict.nav.demoAccount };

  /** Aktif dil dışındaki dile aynı sayfada geçiş yapan yol. */
  const swap = (target: Locale) => {
    const rest = pathname.split("/").slice(2).join("/");
    return rest ? `/${target}/${rest}` : `/${target}`;
  };

  const isActive = (href: string) => !href.includes("#") && pathname === href;
  const groupActive = (g: NavGroup) => g.links.some((l) => isActive(l.href));

  const renderGroup = (g: NavGroup) => (
    <div className="nav-group" key={g.id} data-open={menu === g.id}>
      <button
        type="button"
        className="nav-trigger"
        aria-expanded={menu === g.id}
        aria-controls={`nav-${g.id}`}
        data-current={groupActive(g)}
        onClick={() => setMenu((m) => (m === g.id ? null : g.id))}
      >
        {g.label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      <div className="nav-menu" id={`nav-${g.id}`}>
        {g.links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={isActive(l.href) ? "page" : undefined}
            onClick={() => setMenu(null)}
          >
            <b>{l.label}</b>
            {l.desc && <span>{l.desc}</span>}
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <header className="site-header" data-scrolled={scrolled}>
      <div className="wrap nav">
        <Link href={path(locale)} className="brand" aria-label={site.name}>
          <Image src="/brand/logo.png" alt="" width={32} height={32} priority />
          <span>Projelio</span>
        </Link>

        <nav className="nav-links" aria-label={dict.nav.menu} ref={navRef}>
          {renderGroup(groups[0])}
          {renderGroup(groups[1])}
          <Link className="nav-plain" href={demo.href}>
            {demo.label}
          </Link>
          {renderGroup(groups[2])}
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
          <a className="nav-login" href={dilliAdres(appLinks.login, locale)}>
            {dict.nav.login}
          </a>
          <a className="btn btn-primary btn-sm" href={dilliAdres(appLinks.signup, locale)}>
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
          {groups.map((g) => (
            <div className="mobile-group" key={g.id}>
              <span className="mobile-group-title">{g.label}</span>
              {g.links.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="mobile-group">
            <Link href={demo.href} onClick={() => setOpen(false)}>
              {demo.label}
            </Link>
          </div>
          <div className="btn-row">
            <a className="btn btn-ghost btn-sm" href={dilliAdres(appLinks.login, locale)}>
              {dict.nav.login}
            </a>
            <a className="btn btn-primary btn-sm" href={dilliAdres(appLinks.signup, locale)}>
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
