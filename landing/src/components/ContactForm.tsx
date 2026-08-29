"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { Dict, Locale } from "@/i18n";
import { path, site } from "@/lib/site";

export default function ContactForm({ dict, locale }: { dict: Dict; locale: Locale }) {
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const f = dict.contact.fields;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, locale }),
      });
      if (!res.ok) throw new Error("failed");
      setState("ok");
      form.reset();
    } catch {
      setState("error");
    }
  }

  if (state === "ok") {
    return (
      <div className="card">
        <div className="alert alert-ok">{dict.contact.success}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setState("idle")}>
          {f.submit}
        </button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={onSubmit}>
      <h3 style={{ marginBottom: 18 }}>{dict.contact.formTitle}</h3>

      {state === "error" && (
        <div className="alert alert-err">
          {dict.contact.error} <a href={`mailto:${site.email}`}>{site.email}</a>
        </div>
      )}

      <div className="field-row">
        <div className="field">
          <label htmlFor="name">{f.name}</label>
          <input id="name" name="name" required autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="email">{f.email}</label>
          <input id="email" name="email" type="email" required autoComplete="email" />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="company">{f.company}</label>
          <input id="company" name="company" autoComplete="organization" />
        </div>
        <div className="field">
          <label htmlFor="phone">{f.phone}</label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="subject">{f.subject}</label>
        <select id="subject" name="subject" defaultValue={dict.contact.subjects[0]}>
          {dict.contact.subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="message">{f.message}</label>
        <textarea id="message" name="message" required />
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

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: "0.85rem" }}>
        <input type="checkbox" name="consent" required style={{ width: "auto", marginTop: 4 }} />
        <span className="muted">
          {f.kvkk}{" "}
          <Link href={path(locale, "legal/kvkk")} style={{ textDecoration: "underline" }}>
            {dict.legal.kvkk.title}
          </Link>
        </span>
      </label>

      <button
        type="submit"
        className="btn btn-primary btn-block"
        style={{ marginTop: 20 }}
        disabled={state === "sending"}
      >
        {state === "sending" ? f.sending : f.submit}
      </button>
    </form>
  );
}
