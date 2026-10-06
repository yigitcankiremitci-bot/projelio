"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dict, Locale } from "@/i18n";
import { apiUrl, path } from "@/lib/site";

/**
 * Alt bilgideki bülten formu: "gelişmelerden haberdar olun".
 *
 * Adres doğrudan API'ye gider (`POST /public/bulten`), landing sunucusu
 * üzerinden değil — hız sınırı IP başına, vekil herkesi tek IP'de toplardı
 * (DemoBooking ile aynı gerekçe). Kayıtlar uygulamada Admin > Bülten
 * aboneleri'nde listelenir.
 *
 * Onay kutusu süs değil: ticari elektronik ileti için açık rıza gerekiyor
 * (6563) ve sunucu da `izin: true` olmadan kayıt açmıyor.
 */
export default function NewsletterForm({ dict, locale }: { dict: Dict; locale: Locale }) {
  const n = dict.newsletter;
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setState("sending");
    try {
      const res = await fetch(`${apiUrl}/public/bulten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eposta: fd.get("email"),
          izin: fd.get("consent") === "on",
          website: fd.get("website"),
          dil: locale,
          kaynak: pathname,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setState("ok");
      form.reset();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="newsletter">
      <div className="newsletter-text">
        <h4>{n.title}</h4>
        <p>{n.lead}</p>
      </div>

      {state === "ok" ? (
        <div className="alert alert-ok newsletter-ok">{n.success}</div>
      ) : (
        <form className="newsletter-form" onSubmit={onSubmit}>
          <div className="newsletter-row">
            <label htmlFor="newsletter-email" className="sr-only">
              {n.placeholder}
            </label>
            <input
              id="newsletter-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder={n.placeholder}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={state === "sending"}>
              {state === "sending" ? n.sending : n.submit}
            </button>
          </div>

          {/* spam tuzağı — insanlar görmez, botlar doldurur */}
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
          />

          <label className="newsletter-consent">
            <input type="checkbox" name="consent" required />
            <span>
              {n.consent}{" "}
              <Link href={path(locale, "legal/kvkk")}>{dict.legal.kvkk.title}</Link>
            </span>
          </label>

          {state === "error" && <p className="newsletter-err">{n.error}</p>}
        </form>
      )}
    </div>
  );
}
