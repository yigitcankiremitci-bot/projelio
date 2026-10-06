"use client";

import { useId, useState, type FormEvent } from "react";
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
 *
 * Aynı form iki yerde: alt bilgide (`footer`) ve sağ alttaki açılır kutuda
 * (`popup`, bkz. NewsletterPopup). İkisi aynı sayfada olduğu için alan
 * kimlikleri useId ile üretiliyor — sabit id iki kez basılırdı.
 */
export const BULTEN_ABONE_ANAHTARI = "projelio-bulten-abone";

export default function NewsletterForm({
  dict,
  locale,
  variant = "footer",
  onSubscribed,
}: {
  dict: Dict;
  locale: Locale;
  variant?: "footer" | "popup";
  onSubscribed?: () => void;
}) {
  const n = dict.newsletter;
  const pathname = usePathname();
  const emailId = useId();
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
      // Abone olan kişiye açılır kutu bir daha çıkmasın (hangi formdan olursa olsun).
      try {
        localStorage.setItem(BULTEN_ABONE_ANAHTARI, "1");
      } catch {}
      onSubscribed?.();
    } catch {
      setState("error");
    }
  }

  return (
    <div className={variant === "popup" ? "newsletter newsletter-popup-body" : "newsletter"}>
      {variant === "footer" && (
        <div className="newsletter-text">
          <h4>{n.title}</h4>
          <p>{n.lead}</p>
        </div>
      )}

      {state === "ok" ? (
        <div className="alert alert-ok newsletter-ok">{n.success}</div>
      ) : (
        <form className="newsletter-form" onSubmit={onSubmit}>
          <div className="newsletter-row">
            <label htmlFor={emailId} className="sr-only">
              {n.placeholder}
            </label>
            <input
              id={emailId}
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
