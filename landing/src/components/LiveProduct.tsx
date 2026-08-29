"use client";

import { useEffect, useRef, useState } from "react";
import type { Dict, Locale } from "@/i18n";
import { Check, Sparkle } from "./Icons";

/**
 * Kendi kendine oynayan ürün animasyonu.
 * Dört aşamalı döngü: Lio görevi açar → pano ilerler → bütçe işler → rapor gelir.
 * Yalnızca ekranda görünürken çalışır; prefers-reduced-motion açıksa durur.
 */

const STEP_MS = 2900;

const L = {
  tr: {
    todo: "Yapılacak",
    doing: "Devam eden",
    done: "Tamamlandı",
    card: "Ana sayfa tasarımı",
    cardMeta: ["Galata · yarın 11:00", "Galata · süre işliyor", "Galata · süre işliyor", "Galata · bugün bitti"],
    lio: "Yarın 11:00'e Galata ana sayfa tasarımını aç",
    lioReply: "✅ Görev oluşturuldu · Galata · yarın 11:00",
    budget: "Proje bütçesi",
    revenue: "Bu ay gelir",
    toast: "Haftalık rapor hazır — 23 iş tamamlandı",
    filler: [
      ["Saha fotoğrafları", "Kartal"],
      ["Sözleşme taslağı", "Hukuk"],
      ["Teklif revizyonu", "Aydın Yapı"],
      ["Ekip toplantısı notu", "Yönetim"],
    ],
  },
  en: {
    todo: "To do",
    doing: "In progress",
    done: "Done",
    card: "Homepage design",
    cardMeta: ["Galata · tomorrow 11:00", "Galata · tracking", "Galata · tracking", "Galata · done today"],
    lio: "Open the Galata homepage design for tomorrow 11:00",
    lioReply: "✅ Task created · Galata · tomorrow 11:00",
    budget: "Project budget",
    revenue: "Revenue this month",
    toast: "Weekly report ready — 23 tasks completed",
    filler: [
      ["Site photos", "Kartal"],
      ["Contract draft", "Legal"],
      ["Proposal revision", "Aydın"],
      ["Meeting notes", "Management"],
    ],
  },
};

export default function LiveProduct({ dict, locale }: { dict: Dict; locale: Locale }) {
  const t = L[locale === "en" ? "en" : "tr"];
  const [step, setStep] = useState(0);
  const [live, setLive] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Sadece görünürken oynat.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setLive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setLive(e.isIntersecting)),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!live) return;
    const reduce =
      typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % 4), STEP_MS);
    return () => clearInterval(id);
  }, [live]);

  // Kartın kanban içindeki yatay konumu
  const column = step === 0 ? 0 : step === 3 ? 2 : 1;
  const shift = `calc(${column * 100}% + ${column * 10}px)`;
  const budgetPct = step >= 2 ? 74 : 41;

  return (
    <div className="live" ref={wrapRef}>
      <ol className="live-steps" aria-label={dict.live.title}>
        {dict.live.steps.map((s, i) => (
          <li key={s.title} className="live-step" data-active={i === step}>
            <span className="live-step-dot">{i < step ? <Check size={13} /> : i + 1}</span>
            <div>
              <strong>{s.title}</strong>
              <span>{s.text}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="live-screen">
        <div className="shot-frame">
          <i />
          <i />
          <i />
          <span>{dict.live.frame}</span>
        </div>

        <div className="live-body">
          {/* Lio komut satırı */}
          <div className="live-lio" data-active={step === 0}>
            <span className="live-lio-avatar">
              <Sparkle size={14} />
            </span>
            <span className="live-lio-text">{step === 0 ? t.lio : t.lioReply}</span>
          </div>

          {/* Kanban */}
          <div className="live-kanban">
            {[t.todo, t.doing, t.done].map((title, i) => (
              <div className="live-col" key={title} data-hot={column === i}>
                <b>{title}</b>
                {i === 0 && (
                  <>
                    <div className="live-ghost">{t.filler[0][0]}</div>
                    <div className="live-ghost">{t.filler[1][0]}</div>
                  </>
                )}
                {i === 1 && <div className="live-ghost">{t.filler[2][0]}</div>}
                {i === 2 && <div className="live-ghost">{t.filler[3][0]}</div>}
              </div>
            ))}

            <div className="live-card" style={{ transform: `translateX(${shift})` }}>
              <strong>{t.card}</strong>
              <em>{t.cardMeta[step]}</em>
              <span className="live-card-bar">
                <span style={{ width: `${[10, 45, 78, 100][step]}%` }} />
              </span>
            </div>
          </div>

          {/* Bütçe + gelir */}
          <div className="live-metrics">
            <div className="live-metric">
              <span>{t.budget}</span>
              <div className="mock-bar">
                <span style={{ width: `${budgetPct}%` }} />
              </div>
              <b data-bump={step === 2}>%{budgetPct}</b>
            </div>
            <div className="live-metric">
              <span>{t.revenue}</span>
              <b data-bump={step === 2}>{step >= 2 ? "₺148.500" : "₺112.300"}</b>
            </div>
          </div>

          {/* Rapor bildirimi */}
          <div className="live-toast" data-show={step === 3}>
            <span className="live-toast-dot" />
            {t.toast}
          </div>
        </div>
      </div>
    </div>
  );
}
